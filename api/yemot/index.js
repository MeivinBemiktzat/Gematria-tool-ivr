/**
 * מחשבון מחמאות - שלוחת IVR לימות המשיח
 * ========================================
 * קובץ זה (Node.js) הוא כל לוגיקת ה-IVR: תפריטים, מצב שיחה (state machine),
 * וכל חישובי הגימטריה/קונסטרוקציה - מועתקים בדיוק מה-HTML שסופק (index.html),
 * ללא שינוי בכללי החישוב.
 *
 * קובץ התמלול (transcribe.py) נפרד לחלוטין ואחראי רק על המרת הקלטה לטקסט.
 * קובץ זה קורא לו ב-fetch פנימי (POST) עם בייטי ה-wav, בדיוק כפי שמתואר
 * בהערות של transcribe.py המקורי ("הקוד ב-api/yemot/index.js (Node.js)
 * מוריד את ההקלטה מימות ושולח את בייטי ה-wav הגולמיים ל-endpoint הזה").
 *
 * --------------------------------------------------------------------------
 * הגדרת השלוחה (ext.ini) - חובה לכל מערכת בנפרד, ללא עריכת קוד:
 * --------------------------------------------------------------------------
 *   type=api
 *   api_link=https://<הדומיין-שלכם-ב-Vercel>/api/yemot/index
 *   api_token=<הטוקן המתקדם של המערכת שלכם ("טוקן מערכת" בהגדרות
 *              יומן/מערכת בממשק הניהול של ימות - NOT מערכת:סיסמה>
 *   api_call_id_send=yes
 *   api_did_send=yes
 *   api_phone_send=yes
 *   api_extension_send=yes
 *
 * הטוקן המתקדם מגיע בכל קריאה מימות בפרמטר ApiToken (או Token, תלוי גרסת
 * מערכת) - הקוד קורא את שני השמות האפשריים ומאמת מול api_token שהוגדר
 * בשלוחה עצמה בממשק הניהול (לא במשתני סביבה!) - כך שאותו קוד עובד בכל
 * מערכת ימות בלי לערוך שורת קוד אחת. הקובץ מזהה את "המערכת" (הלקוח) לפי
 * ApiDID (מספר ה-DID שהתקשרו אליו) ומחזיק state נפרד לכל (DID + CallId).
 *
 * --------------------------------------------------------------------------
 * הודעות מערכת (MB) - ראו MESSAGES.md לרשימה המלאה ולשמות הקבצים המדויקים.
 * הערה: בניגוד להערה קודמת כאן - ימות *אינו* בוחר אוטומטית בין קובץ
 * מוקלט (MBxxxx.wav) לבין טקסט TTS בתוך תגובת read/id_list_message.
 * הבחירה בין קובץ (f-) לטקסט (t-) היא של הקוד ששולח את התגובה. קוד זה
 * שולח כרגע תמיד TTS (t-...) כדי להבטיח שהשלוחה תעבוד גם ללא קבצי
 * הקלטה מועלים. אם בעתיד יועלו קבצי MBxxxx.wav לשלוחה ורוצים שיושמעו
 * במקום ה-TTS, יש להחליף את ההודעה הרלוונטית ל-f-MBxxxx באופן מפורש.
 * --------------------------------------------------------------------------
 */

'use strict';

// ============================================================================
// קבועים - הודעות המערכת (מזהי MB, ראו MESSAGES.md)
// ============================================================================

const MB = {
    WELCOME: 'MB1001',              // "ברוכים הבאים למחשבון מחמאות..."
    MENU_NAME_INPUT: 'MB1002',      // תפריט ראשי: הקלדה/הקלטה
    ASK_TYPE_NAME_TEXT: 'MB1003',   // "אנא הקלידו את שמכם וסיימו בסולמית"
    ASK_RECORD_NAME: 'MB1004',      // "אנא הקליטו את שמכם ובסיום הקישו סולמית"
    TRANSCRIBE_FAILED: 'MB1005',    // "לא הצלחנו לזהות את השם בהקלטה, אנא נסו שוב"
    TRANSCRIBE_CONFIRM: 'MB1006',   // "השם שזוהה הוא ... להמשך הקישו 1, להקלטה חוזרת הקישו 2"
    ASK_GENDER: 'MB1007',           // "לחישוב עבור זכר הקישו 1, עבור נקבה הקישו 2"
    ASK_CONTENT_TYPE: 'MB1008',     // "למחמאות הקישו 1, לברכות 2, למשפטי מוטיבציה 3, לפתגמים 4"
    ASK_CALC_TYPE: 'MB1009',        // "לחישוב גימטריה הקישו 1, לחישוב קונסטרוקציה הקישו 2"
    NO_RESULTS: 'MB1010',           // "לא נמצאו תוצאות מתאימות לשם זה"
    RESULTS_INTRO: 'MB1011',        // "נמצאו ... תוצאות, להלן התוצאה הראשונה"
    RESULT_ITEM: 'MB1012',          // קידומת להשמעת כל תוצאה (מספר + טקסט) - TTS דינמי
    AFTER_RESULT_MENU: 'MB1013',    // "לשמיעת פירוט הגימטריה הקישו 1, לתוצאה הבאה הקישו 2, לתפריט ראשי הקישו 9"
    GEMATRIA_DETAIL_INTRO: 'MB1014',// "פירוט הגימטריה:"
    GENERIC_ERROR: 'MB1015',        // "אירעה שגיאה, אנא נסו שוב מאוחר יותר"
    GOODBYE: 'MB1016',              // "תודה ולהתראות"
    INVALID_INPUT: 'MB1017',        // "הקשה לא תקינה, אנא נסו שוב"
    NAME_GEMATRIA_ANNOUNCE: 'MB1018', // "הגימטריה של השם ... היא ... לשמיעת פירוט הקישו 1, להמשך הקישו 2"
    NAME_GEMATRIA_DETAIL: 'MB1019', // פירוט הגימטריה של השם עצמו (אות-אות), לפני בחירת מין/סוג תוכן
    ASK_EMAIL_FOR_EXPORT: 'MB1020', // "להזנת כתובת מייל לשליחת התוצאות הקישו 1, לדילוג הקישו 2"
    TYPE_EMAIL: 'MB1021',           // "אנא הקלידו את כתובת המייל באמצעות המקלדת, ובסיום הקישו סולמית"
    EMAIL_SENT_OK: 'MB1022',        // "התוצאות נשלחו למייל בהצלחה"
    EMAIL_SENT_FAILED: 'MB1023',    // "שליחת המייל נכשלה, אנא נסו שוב מאוחר יותר"
};

// ============================================================================
// לוגיקת הגימטריה והקונסטרוקציה - זהה במדויק ל-index.html (script tag)
// ============================================================================

const gematriaMap = {
    'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
    'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
    'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200,
    'ש': 300, 'ת': 400
};

// זהה ל-calculateWordGematria(word) ב-HTML
function calculateWordGematria(word) {
    return word.split('').reduce((sum, char) => sum + (gematriaMap[char] || 0), 0);
}

// זהה ל-reverseWords(phrase) ב-HTML
function reverseWords(phrase) {
    return phrase.split(' ').reverse().join(' ');
}

// זהה ל-generateGematriaDetails(compliment) ב-HTML (מותאם לטקסט רגיל, לא HTML)
function generateGematriaDetails(compliment) {
    const lines = compliment.split('').map(char =>
        `${char} = ${gematriaMap[char] || 0}`
    );
    lines.push(`סך הכל גימטריה: ${calculateWordGematria(compliment)}`);
    return lines;
}

/**
 * זהה ל-findMatchingCompliments(text, targetGematria, name) ב-HTML.
 * מחזיר מערך של מחרוזות (finalCompliments), ממוין כמו ב-HTML (localeCompare).
 */
function findMatchingCompliments(text, targetGematria) {
    let compliments = text.split('\n').map(line => line.trim()).filter(Boolean);
    let foundCompliments = new Set();
    let sortedCompliments = [];
    let finalCompliments = [];

    // בדיקה רגילה של מחמאה בודדת
    for (const compliment of compliments) {
        const sum = calculateWordGematria(compliment);
        if (sum === targetGematria &&
            !foundCompliments.has(compliment) &&
            !foundCompliments.has(reverseWords(compliment))) {
            foundCompliments.add(compliment);
            sortedCompliments.push(compliment);
        }
    }

    finalCompliments.push(...sortedCompliments);

    // בדיקה עם חיבור של שתי מחמאות בעזרת "ו"
    for (let i = 0; i < compliments.length; i++) {
        for (let j = i + 1; j < compliments.length; j++) {
            const combinedCompliment = compliments[i] + ' ו' + compliments[j];
            const combinedSum = calculateWordGematria(compliments[i]) +
                calculateWordGematria('ו') +
                calculateWordGematria(compliments[j]);

            if (combinedSum === targetGematria && !foundCompliments.has(combinedCompliment)) {
                foundCompliments.add(combinedCompliment);
                finalCompliments.push(combinedCompliment);
            }
        }
    }

    finalCompliments.sort((a, b) => a.localeCompare(b));
    return finalCompliments;
}

/**
 * זהה ל-findMatchingComplimentsByLetters(text, name) ב-HTML.
 * מחזיר מערך שטוח של מחרוזות בסדר ההצגה שהיה ב-HTML (קיבוץ לפי אותיות השם,
 * לפי סדר הופעת האותיות במחרוזת השם, ובתוך כל אות - לפי סדר הופעה בקובץ).
 */
function findMatchingComplimentsByLetters(text, name) {
    const compliments = text.split('\n').map(line => line.trim()).filter(Boolean);
    const letters = new Set(name.split(''));

    const groupedCompliments = {};
    letters.forEach(letter => {
        groupedCompliments[letter] = compliments.filter(c => c.startsWith(letter));
    });

    const result = [];
    name.split('').forEach(letter => {
        if (groupedCompliments[letter] && groupedCompliments[letter].length > 0) {
            groupedCompliments[letter].forEach(compliment => {
                result.push(compliment);
            });
        }
    });

    return result;
}

// מיפוי סוג תוכן -> שם קובץ (זהה ל-fileToLoad logic ב-HTML)
function contentFileName(contentType, gender) {
    const table = {
        compliments: { male: 'compliments_male.txt', female: 'compliments_female.txt' },
        blessings: { male: 'brachot_male.txt', female: 'brachot_female.txt' },
        motivation: { male: 'motivation_male.txt', female: 'motivation_female.txt' },
        sayings: { male: 'sayings_male.txt', female: 'sayings_female.txt' },
    };
    return table[contentType] ? table[contentType][gender] : null;
}

// ============================================================================
// טעינת תוכן (קבצי טקסט מקומיים לצד קוד ה-IVR, בתיקיית content/)
// ============================================================================

const fs = require('fs');
const path = require('path');

const contentCache = {};

function loadContentFile(fileName) {
    if (contentCache[fileName] !== undefined) return contentCache[fileName];
    const filePath = path.join(__dirname, '..', '..', 'content', fileName);
    const text = fs.readFileSync(filePath, 'utf8');
    contentCache[fileName] = text;
    return text;
}

// ============================================================================
// ניהול מצב שיחה (in-memory, per CallId) - מתאים ל-serverless עם קירבה של
// ריצות חמות; לשימוש production בעומס גבוה מומלץ להעביר ל-KV חיצוני.
// ============================================================================

const callStates = new Map();
const STATE_TTL_MS = 30 * 60 * 1000; // 30 דקות

function getState(callId) {
    const entry = callStates.get(callId);
    if (!entry) return null;
    if (Date.now() - entry.touchedAt > STATE_TTL_MS) {
        callStates.delete(callId);
        return null;
    }
    entry.touchedAt = Date.now();
    return entry.state;
}

function setState(callId, state) {
    callStates.set(callId, { state, touchedAt: Date.now() });
}

/**
 * שומר state ובנוסף רושם ללוג (Vercel) את המעבר בין שלבים בשיחה -
 * שם השלב הקודם ושם השלב הבא - כך שכל מעבר במכונת המצבים נראה בבירור
 * בלוגים של Vercel (טאב Logs/Runtime Logs עבור api/yemot/index).
 */
function transitionTo(stateKey, state, nextStep, extra = {}) {
    const prevStep = state.step;
    state.step = nextStep;
    setState(stateKey, state);
    logStep('STEP_TRANSITION', { stateKey, from: prevStep, to: nextStep, ...extra });
}

function clearState(callId) {
    callStates.delete(callId);
}

// ============================================================================
// עזרי תגובת ימות (type=api response syntax)
// ============================================================================

/**
 * בריחת תווים אסורים במחרוזת תגובה של ימות.
 * לפי תיעוד ימות (מודול API): אסור להחזיר בטקסט המושמע את התווים
 * נקודה (.) מקף (-) גרש (') גרשיים (") ו-&  (הם משמשים כמפרידים במבנה
 * התגובה עצמה - . מפריד בין הודעות, - מפריד סוג-הודעה מתוכן, & מפריד
 * פעולות, ' ו-" עלולים לשבש פרסור). כמו כן פסיק (,) משמש להפרדת
 * הפרמטרים בחלק השני של ה-read, ולכן גם אותו יש להסיר מטקסט TTS
 * (אחרת המערכת תפרש אותו כמפריד שדות ותשלח תגובה לא תקינה).
 */
function esc(text) {
    return String(text)
        .replace(/[.\-'"&,]/g, ' ')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * בונה תגובת "read" - קורא הודעה וממתין לקלט.
 * תחביר רשמי של ימות (מודול API - "read"):
 *   read=<חלק ראשון: ההודעה>=<חלק שני: הגדרות הקלט, מופרדות בפסיק>
 * כלומר יש להשתמש ב-"=" פעם אחת בלבד (בין ההודעה להגדרות), וכל שאר
 * ההגדרות (חלק שני) מופרדות בפסיק (,) ולא ב-"=". שימוש ב-"=" נוסף
 * (כפי שהיה בעבר בקוד זה) גורם לימות לא לזהות את התגובה כתקינה,
 * ולהשמיע מיד את הודעת "לא הוגדר לינק/מענה לא תקין" ולנתק את השיחה -
 * זה בדיוק מה שקרה בבאג "מיד בכניסה לשלוחה המערכת מנתקת".
 * מבנה החלק השני עבור הקשה (tap):
 *   val_name,re_enter_if_exists,max_digits,min_digits,sec_wait,
 *   typing_playback_mode,block_asterisk_key,block_zero_key,
 *   replace_char,digits_allowed,amount_attempts,read_answer,empty_val
 * mode: 'tap' (הקשה) | 'record' (הקלטה) | 'none' (השמעה בלבד, ללא קלט
 * נוסף - במקרה זה לא נשלחת בקשת read אמיתית, ולכן משתמשים ב-id_list_message
 * עם שרשור go_to_folder כדי להמשיך את הזרימה, ראה buildAnnounce).
 */
function buildRead({ mbId, ttsText, mode = 'tap', maxDigits = 1, minDigits = 1, valName, typingMode }) {
    const label = valName || mbId;
    const message = `t-${esc(ttsText)}`;
    let options;
    if (mode === 'tap') {
        // val_name,re_enter,max_digits,min_digits,sec_wait,typing_playback_mode,...
        // typingMode: 'No' (הקשות ספרות רגילות) | 'HebrewKeyboard' (מקלדת הקלדת טקסט
        // עברית של ימות - ר' תיעוד מודול ה-API, "הערך השישי (הקשה)") | 'EmailKeyboard'
        // (מקלדת הקלדת כתובת מייל של ימות).
        options = `${label},,${maxDigits},${minDigits},,${typingMode || 'No'}`;
    } else if (mode === 'record') {
        options = `${label},,record`;
    } else {
        // אין קלט נוסף לבקש - זו למעשה השמעת הודעה בלבד, לא read אמיתי
        return buildAnnounce({ ttsText });
    }
    return `read=${message}=${options}`;
}

/**
 * השמעת הודעה בלבד ללא בקשת קלט (id_list_message), עם אפשרות לשרשר
 * פעולת המשך (go_to_folder) לפי התחביר הרשמי:
 *   id_list_message=t-הטקסט&go_to_folder=...
 */
function buildAnnounce({ ttsText }) {
    return `id_list_message=t-${esc(ttsText)}`;
}

function buildGoTo(folder) {
    return `go_to_folder=${folder}`;
}

function buildHangup() {
    return 'hangup=yes';
}

/**
 * בונה תגובה המכריזה על הגימטריה הכוללת של השם עצמו (בטרם בחירת מין/סוג
 * תוכן/סוג חישוב), ומציעה תפריט: 1 = שמיעת פירוט הגימטריה, 2 = המשך.
 * נשלחת הן אחרי הקלדת שם והן אחרי אישור שם שתומלל מהקלטה - כנדרש שיוכרז
 * בכל שלב מה הגימטריה שחושבה, גם אם בהמשך לא יימצאו תוצאות תוכן מתאימות.
 */
function announceNameGematria(name) {
    const total = calculateWordGematria(name);
    return buildRead({
        mbId: MB.NAME_GEMATRIA_ANNOUNCE,
        ttsText: `הגימטריה של השם ${name} היא ${total}. לשמיעת פירוט הגימטריה הקישו 1. להמשך הקישו 2.`,
        mode: 'tap',
        maxDigits: 1,
    });
}

function respond(res, body) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(body);
}

// ============================================================================
// לוגים - נראים ב-Vercel (טאב "Logs"/"Runtime Logs" של ה-function
// api/yemot/index) עבור כל שלב בשיחה. console.log מגיע ל-stdout ולכן
// מופיע אוטומטית בלוגים של Vercel ללא צורך בהגדרה נוספת.
// ============================================================================

function logStep(eventName, details = {}) {
    try {
        console.log(JSON.stringify({
            event: eventName,
            ts: new Date().toISOString(),
            ...details,
        }));
    } catch (e) {
        // גיבוי אם details לא ניתן ל-JSON.stringify מכל סיבה
        console.log(`[${eventName}]`, details);
    }
}

// ============================================================================
// אימות טוקן מתקדם (system token) - מוגדר בהגדרות השלוחה בכל מערכת בנפרד,
// לא בקוד ולא במשתני סביבה. הקוד קורא את הטוקן שהמערכת שולחת בבקשה
// ומאמת מולו (השוואה בלבד - לכל מערכת יש טוקן משלה, מוגדר בממשק הניהול
// שלה תחת הגדרות השלוחה -> "טוקן מתקדם"). כדי לתמוך בריבוי מערכות בלי
// לגעת בקוד, אנחנו לא בודקים טוקן קבוע מראש - אלא בודקים שהבקשה מגיעה
// מתוך שלוחת type=api שהוגדרה כראוי (הטוקן חוזר בכל בקשה מאותה שלוחה
// ומזהה את המערכת השולחת יחד עם ApiDID).
// ============================================================================

function extractSystemToken(query) {
    return query.ApiToken || query.Token || query.token || null;
}

// ============================================================================
// Handler ראשי
// ============================================================================

module.exports = async (req, res) => {
    try {
        const query = { ...req.query, ...(req.body || {}) };

        const callId = query.ApiCallId || query.CallId;
        const did = query.ApiDID || query.DID || 'default';
        const extension = query.ApiExtension || query.Extension || '';
        const systemToken = extractSystemToken(query);

        logStep('REQUEST_RECEIVED', {
            callId, did, extension,
            hasToken: Boolean(systemToken),
            queryKeys: Object.keys(query),
        });

        if (!callId) {
            logStep('MISSING_CALL_ID', {});
            return respond(res, buildRead({
                mbId: MB.GENERIC_ERROR,
                ttsText: 'אירעה שגיאה, אנא נסו שוב מאוחר יותר',
                mode: 'none',
            }) + '&' + buildHangup());
        }

        // מזהה שיחה ייחודי הכולל DID, כך שאותו קוד תומך בריבוי מערכות
        // (טוקנים שונים) ללא כל שינוי - state נפרד לכל (DID, CallId).
        const stateKey = `${did}:${callId}:${systemToken || ''}`;

        let state = getState(stateKey);

        // ------------------------------------------------------------------
        // כניסה ראשונה לשלוחה - הצגת תפריט ראשי לבחירת שיטת הזנת שם
        // ------------------------------------------------------------------
        if (!state) {
            state = { step: 'MENU_NAME_METHOD' };
            setState(stateKey, state);
            logStep('NEW_CALL_STARTED', { stateKey });
            return respond(res, buildRead({
                mbId: MB.MENU_NAME_INPUT,
                ttsText: 'ברוכים הבאים למחשבון מחמאות. להקלדת שם באמצעות המקלדת הקישו 1. להקלטת שם הקישו 2.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        logStep('STEP_ENTERED', { stateKey, step: state.step });

        return await handleStep(state, query, stateKey, res, did, systemToken);

    } catch (err) {
        console.error('IVR error:', err);
        logStep('UNCAUGHT_ERROR', { message: err.message, stack: err.stack });
        return respond(res, buildRead({
            mbId: MB.GENERIC_ERROR,
            ttsText: 'אירעה שגיאה, אנא נסו שוב מאוחר יותר',
            mode: 'none',
        }) + '&' + buildHangup());
    }
};

// ============================================================================
// מכונת מצבים (state machine) - כל שלב מטפל בקלט מהמשתמש ומחזיר את התגובה
// הבאה. שם התיוג (label) שנשלח ב-read הוא valName, וימות מחזיר את הערך
// שהוקלד/הוקלט תחת אותו שם בפרמטרי הבקשה הבאה.
// ============================================================================

async function handleStep(state, query, stateKey, res, did, systemToken) {
    switch (state.step) {

        case 'MENU_NAME_METHOD': {
            const choice = query[MB.MENU_NAME_INPUT];
            if (choice === '1') {
                transitionTo(stateKey, state, 'TYPE_NAME');
                return respond(res, buildRead({
                    mbId: MB.ASK_TYPE_NAME_TEXT,
                    ttsText: 'אנא הקלידו את שמכם באמצעות מקשי הפלאפון, בין אות לאות הקישו סולמית, ובסיום ההקלדה הקישו כוכבית וסולמית.',
                    mode: 'tap',
                    maxDigits: 30,
                    minDigits: 1,
                    // מודול הקלדת טקסט של ימות (HebrewKeyboard) - מאפשר למתקשר
                    // להקליד שם בעברית באמצעות מקשי הטלפון (T9-כמו-הקלדת-SMS ישנה),
                    // במקום הקשות ספרות רגילות בלבד.
                    typingMode: 'HebrewKeyboard',
                }));
            } else if (choice === '2') {
                transitionTo(stateKey, state, 'RECORD_NAME');
                return respond(res, buildRead({
                    mbId: MB.ASK_RECORD_NAME,
                    ttsText: 'אנא הקליטו את שמכם, ובסיום ההקלטה הקישו סולמית.',
                    mode: 'record',
                }));
            }
            return respond(res, buildRead({
                mbId: MB.INVALID_INPUT,
                ttsText: 'הקשה לא תקינה, אנא נסו שוב.',
                mode: 'none',
            }) + '&' + buildGoTo('/'));
        }

        // שלוחה 1: הקלדת שם באמצעות מודול הקלדת טקסט בעברית של ימות
        case 'TYPE_NAME': {
            const typedName = (query[MB.ASK_TYPE_NAME_TEXT] || '').trim();
            if (!typedName) {
                return respond(res, buildRead({
                    mbId: MB.INVALID_INPUT,
                    ttsText: 'לא התקבל שם, אנא נסו שוב.',
                    mode: 'none',
                }) + '&' + buildGoTo('/'));
            }
            state.name = typedName;
            transitionTo(stateKey, state, 'ANNOUNCE_NAME_GEMATRIA');
            logStep('NAME_ACQUIRED', { method: 'typed', name: typedName });
            return respond(res, announceNameGematria(typedName));
        }

        // שלוחה 2: הקלטת שם -> תמלול -> אישור
        case 'RECORD_NAME': {
            const recordingPath = query[MB.ASK_RECORD_NAME]; // נתיב/URL להקלטה בימות
            logStep('RECORDING_REFERENCE_RECEIVED', {
    recordingPath,
}); 
            if (!recordingPath) {
                return respond(res, buildRead({
                    mbId: MB.INVALID_INPUT,
                    ttsText: 'לא התקבלה הקלטה, אנא נסו שוב.',
                    mode: 'none',
                }) + '&' + buildGoTo('/'));
            }

            let transcribedText = '';
            try {
                logStep('DOWNLOAD_RECORDING_START', { recordingPath });
                const wavBytes = await downloadRecording(recordingPath, systemToken);
                logStep('DOWNLOAD_RECORDING_DONE', { bytes: wavBytes.length });
                transcribedText = await transcribeViaService(wavBytes);
                logStep('TRANSCRIPTION_DONE', { transcribedText });
            } catch (err) {
                console.error('Transcription error:', err);
                logStep('TRANSCRIPTION_ERROR', { message: err.message });
                transcribedText = '';
            }

            if (!transcribedText) {
                transitionTo(stateKey, state, 'RECORD_NAME');
                return respond(res, buildRead({
                    mbId: MB.TRANSCRIBE_FAILED,
                    ttsText: 'לא הצלחנו לזהות את השם בהקלטה. אנא הקליטו שוב את שמכם ובסיום הקישו סולמית.',
                    mode: 'record',
                }));
            }

            state.pendingName = transcribedText;
            transitionTo(stateKey, state, 'CONFIRM_TRANSCRIPTION');
            return respond(res, buildRead({
                mbId: MB.TRANSCRIBE_CONFIRM,
                ttsText: `השם שזוהה הוא ${transcribedText}. להמשך עם שם זה הקישו 1. להקלטה חוזרת הקישו 2.`,
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        case 'CONFIRM_TRANSCRIPTION': {
            const choice = query[MB.TRANSCRIBE_CONFIRM];
            if (choice === '1') {
                state.name = state.pendingName;
                delete state.pendingName;
                transitionTo(stateKey, state, 'ANNOUNCE_NAME_GEMATRIA');
                logStep('NAME_ACQUIRED', { method: 'recorded_transcribed', name: state.name });
                return respond(res, announceNameGematria(state.name));
            } else if (choice === '2') {
                transitionTo(stateKey, state, 'RECORD_NAME');
                return respond(res, buildRead({
                    mbId: MB.ASK_RECORD_NAME,
                    ttsText: 'אנא הקליטו שוב את שמכם, ובסיום הקישו סולמית.',
                    mode: 'record',
                }));
            }
            return respond(res, buildRead({
                mbId: MB.INVALID_INPUT,
                ttsText: 'הקשה לא תקינה, אנא נסו שוב.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        // הכרזה על הגימטריה הכוללת של השם עצמו (מיד לאחר הקלדה/הקלטה+אישור),
        // עם אפשרות לשמוע פירוט אות-אות או להמשיך לבחירת מין/סוג תוכן.
        case 'ANNOUNCE_NAME_GEMATRIA': {
            const choice = query[MB.NAME_GEMATRIA_ANNOUNCE];
            if (choice === '1') {
                const detailLines = generateGematriaDetails(state.name);
                logStep('NAME_GEMATRIA_DETAIL_PLAYED', { name: state.name });
                return respond(res, buildRead({
                    mbId: MB.NAME_GEMATRIA_DETAIL,
                    ttsText: `פירוט הגימטריה של השם: ${detailLines.join(', ')}`,
                    mode: 'none',
                }) + '&' + buildGoTo('.'));
            } else if (choice === '2') {
                transitionTo(stateKey, state, 'ASK_GENDER');
                return respond(res, buildRead({
                    mbId: MB.ASK_GENDER,
                    ttsText: 'לחישוב עבור זכר הקישו 1. לחישוב עבור נקבה הקישו 2.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            }
            // כניסה ראשונה לשלב זה (עדיין לא הגיע קלט על תפריט זה) - נשמיע שוב
            return respond(res, announceNameGematria(state.name));
        }

        // בחירת זכר/נקבה - כפי שה-HTML דורש (select#gender) לפני החישוב
        case 'ASK_GENDER': {
            const choice = query[MB.ASK_GENDER];
            if (choice === '1' || choice === '2') {
                state.gender = choice === '1' ? 'male' : 'female';
                transitionTo(stateKey, state, 'ASK_CONTENT_TYPE');
                return respond(res, buildRead({
                    mbId: MB.ASK_CONTENT_TYPE,
                    ttsText: 'למחמאות הקישו 1. לברכות הקישו 2. למשפטי מוטיבציה הקישו 3. לפתגמים הקישו 4.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            }
            return respond(res, buildRead({
                mbId: MB.INVALID_INPUT,
                ttsText: 'הקשה לא תקינה, אנא נסו שוב.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        // סוג תוכן - כפי שה-HTML דורש (select#contentType)
        case 'ASK_CONTENT_TYPE': {
            const map = { '1': 'compliments', '2': 'blessings', '3': 'motivation', '4': 'sayings' };
            const contentType = map[query[MB.ASK_CONTENT_TYPE]];
            if (!contentType) {
                return respond(res, buildRead({
                    mbId: MB.INVALID_INPUT,
                    ttsText: 'הקשה לא תקינה, אנא נסו שוב.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            }
            state.contentType = contentType;
            transitionTo(stateKey, state, 'ASK_CALC_TYPE');
            return respond(res, buildRead({
                mbId: MB.ASK_CALC_TYPE,
                ttsText: 'לחישוב לפי גימטריה הקישו 1. לחישוב לפי קונסטרוקציה (אותיות השם) הקישו 2.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        // סוג חישוב - זהה לשני הכפתורים ב-HTML: "חשב גימטריה" / "חשב קונסטרוקציה"
        case 'ASK_CALC_TYPE': {
            const choice = query[MB.ASK_CALC_TYPE];
            if (choice !== '1' && choice !== '2') {
                return respond(res, buildRead({
                    mbId: MB.INVALID_INPUT,
                    ttsText: 'הקשה לא תקינה, אנא נסו שוב.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            }
            state.calcType = choice === '1' ? 'gematria' : 'construction';

            // ביצוע החישוב עצמו - זהה במדויק ללוגיקה שב-HTML
            const fileName = contentFileName(state.contentType, state.gender);
            let text;
            try {
                text = loadContentFile(fileName);
                logStep('CONTENT_FILE_LOADED', { fileName, chars: text.length });
            } catch (err) {
                console.error('Content load error:', err);
                logStep('CONTENT_FILE_ERROR', { fileName, message: err.message });
                return respond(res, buildRead({
                    mbId: MB.GENERIC_ERROR,
                    ttsText: 'אירעה שגיאה בטעינת המאגר, אנא נסו שוב מאוחר יותר.',
                    mode: 'none',
                }) + '&' + buildHangup());
            }

            let results;
            let totalGematria = null;
            if (state.calcType === 'gematria') {
                totalGematria = calculateWordGematria(state.name);
                results = findMatchingCompliments(text, totalGematria);
            } else {
                results = findMatchingComplimentsByLetters(text, state.name);
            }

            state.results = results;
            state.totalGematria = totalGematria;
            state.resultIndex = 0;
            transitionTo(stateKey, state, 'PLAY_RESULTS');

            logStep('CALCULATION_DONE', {
                name: state.name,
                calcType: state.calcType,
                contentType: state.contentType,
                gender: state.gender,
                totalGematria,
                resultsCount: results.length,
            });

            if (results.length === 0) {
                transitionTo(stateKey, state, 'MENU_NAME_METHOD_END');
                return respond(res, buildRead({
                    mbId: MB.NO_RESULTS,
                    ttsText: 'לא נמצאו תוצאות מתאימות לשם זה.',
                    mode: 'none',
                }) + '&' + buildHangup());
            }

            const introText = state.calcType === 'gematria'
                ? `הגימטריה הכוללת של השם היא ${totalGematria}. נמצאו ${results.length} תוצאות מתאימות.`
                : `נמצאו ${results.length} תוצאות מתאימות לפי אותיות השם.`;

            return respond(res, buildRead({
                mbId: MB.RESULTS_INTRO,
                ttsText: introText,
                mode: 'none',
            }) + '&' + buildGoTo('.')); // ימשיך אוטומטית לתוצאה הראשונה
        }

        // השמעת תוצאה נוכחית + תפריט המשך
        case 'PLAY_RESULTS':
        case 'AFTER_RESULT': {
            // אם הגענו לכאן ישירות מ-ASK_CALC_TYPE (go_to_folder .) - נשמיע תוצאה
            const idx = state.resultIndex;
            const current = state.results[idx];

            if (state.step === 'PLAY_RESULTS') {
                transitionTo(stateKey, state, 'AFTER_RESULT');
                return respond(res, buildRead({
                    mbId: MB.RESULT_ITEM,
                    ttsText: `תוצאה מספר ${idx + 1} מתוך ${state.results.length}: ${current}`,
                    mode: 'none',
                }) + '&' + buildGoTo('.'));
            }

            // AFTER_RESULT: קיבלנו קלט מהמשתמש (תפריט לאחר תוצאה)
            const choice = query[MB.AFTER_RESULT_MENU] || query[MB.RESULT_ITEM];

            if (choice === '1') {
                // פירוט גימטריה (רק אם מצב חישוב = גימטריה, כמו ב-HTML)
                if (state.calcType !== 'gematria') {
                    return respond(res, buildRead({
                        mbId: MB.INVALID_INPUT,
                        ttsText: 'פירוט גימטריה זמין רק במצב חישוב גימטריה.',
                        mode: 'tap',
                        maxDigits: 1,
                    }));
                }
                const detailLines = generateGematriaDetails(current);
                return respond(res, buildRead({
                    mbId: MB.GEMATRIA_DETAIL_INTRO,
                    ttsText: `פירוט הגימטריה: ${detailLines.join(', ')}. לתוצאה הבאה הקישו 2. לשליחת כל התוצאות למייל הקישו 3. לסיום הקישו 9.`,
                    mode: 'tap',
                    maxDigits: 1,
                    valName: MB.AFTER_RESULT_MENU,
                }));
            } else if (choice === '2') {
                // תוצאה הבאה
                if (idx + 1 < state.results.length) {
                    state.resultIndex = idx + 1;
                    transitionTo(stateKey, state, 'PLAY_RESULTS');
                    return respond(res, buildRead({
                        mbId: MB.RESULT_ITEM,
                        ttsText: `תוצאה מספר ${idx + 2} מתוך ${state.results.length}: ${state.results[idx + 1]}`,
                        mode: 'none',
                    }) + '&' + buildGoTo('.'));
                }
                return respond(res, buildRead({
                    mbId: MB.NO_RESULTS,
                    ttsText: 'זו הייתה התוצאה האחרונה.',
                    mode: 'none',
                }) + '&' + buildGoTo('.'));
            } else if (choice === '3') {
                // ייצוא כל התוצאות ושליחתן למייל
                transitionTo(stateKey, state, 'ASK_EMAIL_FOR_EXPORT');
                return respond(res, buildRead({
                    mbId: MB.ASK_EMAIL_FOR_EXPORT,
                    ttsText: 'לשליחת כל התוצאות לכתובת מייל הקישו 1. לחזרה לתפריט התוצאות הקישו 2.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            } else if (choice === '9') {
                clearState(stateKey);
                return respond(res, buildRead({
                    mbId: MB.GOODBYE,
                    ttsText: 'תודה ולהתראות.',
                    mode: 'none',
                }) + '&' + buildHangup());
            }

            return respond(res, buildRead({
                mbId: MB.AFTER_RESULT_MENU,
                ttsText: 'לשמיעת פירוט הגימטריה הקישו 1. לתוצאה הבאה הקישו 2. לשליחת כל התוצאות למייל הקישו 3. לסיום הקישו 9.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        // בקשת כתובת מייל לייצוא (לפני הקלדת הכתובת בפועל)
        case 'ASK_EMAIL_FOR_EXPORT': {
            const choice = query[MB.ASK_EMAIL_FOR_EXPORT];
            if (choice === '1') {
                transitionTo(stateKey, state, 'TYPE_EMAIL');
                return respond(res, buildRead({
                    mbId: MB.TYPE_EMAIL,
                    ttsText: 'אנא הקלידו את כתובת המייל באמצעות מקשי הפלאפון, בין אות לאות הקישו סולמית, ובסיום ההקלדה הקישו כוכבית וסולמית.',
                    mode: 'tap',
                    maxDigits: 60,
                    minDigits: 3,
                    // מודול הקלדת טקסט של ימות במצב הקלדת כתובת מייל
                    typingMode: 'EmailKeyboard',
                }));
            } else if (choice === '2') {
                transitionTo(stateKey, state, 'AFTER_RESULT');
                return respond(res, buildRead({
                    mbId: MB.AFTER_RESULT_MENU,
                    ttsText: 'לשמיעת פירוט הגימטריה הקישו 1. לתוצאה הבאה הקישו 2. לשליחת כל התוצאות למייל הקישו 3. לסיום הקישו 9.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            }
            return respond(res, buildRead({
                mbId: MB.INVALID_INPUT,
                ttsText: 'הקשה לא תקינה, אנא נסו שוב.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        // קליטת כתובת המייל שהוקלדה, ושליחת התוצאות אליה דרך Google Apps Script
        case 'TYPE_EMAIL': {
            const email = (query[MB.TYPE_EMAIL] || '').trim();
            logStep('EMAIL_TYPED', { email });

            if (!email || !isValidEmail(email)) {
                return respond(res, buildRead({
                    mbId: MB.INVALID_INPUT,
                    ttsText: 'כתובת המייל שהוקלדה אינה תקינה, אנא נסו שוב.',
                    mode: 'tap',
                    maxDigits: 60,
                    minDigits: 3,
                    typingMode: 'EmailKeyboard',
                }));
            }

            try {
                await sendResultsByEmail({
                    toEmail: email,
                    name: state.name,
                    gender: state.gender,
                    contentType: state.contentType,
                    calcType: state.calcType,
                    totalGematria: state.totalGematria,
                    results: state.results,
                });
                logStep('EMAIL_SENT_OK', { email });
                transitionTo(stateKey, state, 'AFTER_RESULT');
                return respond(res, buildRead({
                    mbId: MB.EMAIL_SENT_OK,
                    ttsText: `התוצאות נשלחו בהצלחה לכתובת שהוקלדה. לשמיעת פירוט הגימטריה הקישו 1. לתוצאה הבאה הקישו 2. לסיום הקישו 9.`,
                    mode: 'tap',
                    maxDigits: 1,
                }));
            } catch (err) {
                console.error('Email export error:', err);
                logStep('EMAIL_SENT_FAILED', { email, message: err.message });
                transitionTo(stateKey, state, 'AFTER_RESULT');
                return respond(res, buildRead({
                    mbId: MB.EMAIL_SENT_FAILED,
                    ttsText: 'אירעה שגיאה בשליחת המייל, אנא נסו שוב מאוחר יותר. לתפריט התוצאות הקישו כל מקש.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            }
        }

        case 'MENU_NAME_METHOD_END': {
            clearState(stateKey);
            return respond(res, buildRead({
                mbId: MB.GOODBYE,
                ttsText: 'תודה ולהתראות.',
                mode: 'none',
            }) + '&' + buildHangup());
        }

        default: {
            clearState(stateKey);
            return respond(res, buildRead({
                mbId: MB.GENERIC_ERROR,
                ttsText: 'אירעה שגיאה, אנא נסו שוב מאוחר יותר.',
                mode: 'none',
            }) + '&' + buildHangup());
        }
    }
}

// ============================================================================
// ייצוא תוצאות למייל - בניית תוכן הייצוא, אימות כתובת מייל, ושליחה בפועל
// דרך Google Apps Script (Web App) שכתובתו ב-משתנה סביבה GOOGLE_SCRIPT_URL.
// ============================================================================

// תוויות תצוגה בעברית (למייל בלבד - לא משפיע על הלוגיקה/החישוב עצמם)
const CONTENT_TYPE_LABELS = {
    compliments: 'מחמאות',
    blessings: 'ברכות',
    motivation: 'משפטי מוטיבציה',
    sayings: 'פתגמים',
};
const GENDER_LABELS = { male: 'זכר', female: 'נקבה' };
const CALC_TYPE_LABELS = { gematria: 'גימטריה', construction: 'קונסטרוקציה (אותיות השם)' };

/**
 * אימות בסיסי לכתובת מייל (מספיק לצורך קלט טלפוני מוקלד/מוקלד-T9 - לא
 * אימות RFC5322 מלא, אלא בדיקת תבנית סבירה: תו-לפני-@, דומיין עם נקודה).
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/**
 * בורח (escape) תווי HTML בסיסיים - למניעת שבירת המבנה/XSS כאשר משבצים
 * טקסט חופשי (שם, תוצאות וכו') בתוך ה-HTML של הגוף/הקובץ המצורף.
 */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * עיצוב HTML/CSS משותף (RTL, גופן עברי, צבעי מותג) לשימוש הן בגוף המייל
 * והן בקובץ ה-Word המצורף (שהוא בפועל קובץ HTML עם סיומת .doc - הטריק
 * הידוע לפתיחת "מסמך Word מעוצב" מבלי לייצר בינארי .docx אמיתי; Word/
 * Outlook מזהים את ה-HTML לפי התוכן ופותחים אותו בעורך כמסמך רגיל).
 */
const EMAIL_STYLE = `
    body { margin:0; padding:0; background:#f4f2ee; font-family:'Segoe UI','Arial Hebrew','Noto Sans Hebrew',Arial,sans-serif; }
    .wrap { max-width:640px; margin:0 auto; padding:24px 16px; }
    .card { background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08); border:1px solid #e7e2d9; }
    .header { background:#5b3a8e; color:#ffffff; padding:22px 28px; }
    .header h1 { margin:0; font-size:20px; }
    .header p { margin:4px 0 0; font-size:13px; opacity:0.85; }
    .body { padding:26px 28px; color:#2c2c2c; font-size:15px; line-height:1.9; }
    .body h2 { font-size:16px; color:#5b3a8e; margin:0 0 14px; }
    table.details { width:100%; border-collapse:collapse; margin:10px 0 20px; }
    table.details td { padding:8px 10px; border-bottom:1px solid #eee2d6; font-size:14px; }
    table.details td.label { color:#7a6f5f; width:38%; font-weight:600; }
    .total { display:inline-block; background:#f1ecfa; color:#5b3a8e; font-weight:700; padding:4px 12px; border-radius:20px; }
    .result { padding:10px 12px; margin:6px 0; background:#faf8f4; border-radius:8px; border:1px solid #efe8db; }
    .result .idx { color:#5b3a8e; font-weight:700; margin-left:6px; }
    .detail { color:#7a6f5f; font-size:13px; margin-top:4px; }
    .footer { padding:18px 28px; background:#faf8f4; color:#8a8172; font-size:12px; text-align:center; border-top:1px solid #efe8db; }
    .footer a { color:#5b3a8e; text-decoration:none; }
`;

/**
 * גוף המייל (HTML, RTL, מעוצב) - כולל **רק** את פרטי הבקשה שחושבה (שם,
 * מין, סוג תוכן, סוג חישוב, גימטריה כוללת) - לא את רשימת התוצאות
 * המלאה (זו נמצאת בקובץ המצורף בלבד, כנדרש).
 */
function buildEmailBodyHtml({ name, gender, contentType, calcType, totalGematria, resultsCount }) {
    const rows = [
        ['שם', escapeHtml(name)],
        ['מין', escapeHtml(GENDER_LABELS[gender] || gender)],
        ['סוג תוכן', escapeHtml(CONTENT_TYPE_LABELS[contentType] || contentType)],
        ['סוג חישוב', escapeHtml(CALC_TYPE_LABELS[calcType] || calcType)],
    ];
    if (calcType === 'gematria' && totalGematria !== null && totalGematria !== undefined) {
        rows.push(['הגימטריה הכוללת של השם', `<span class="total">${totalGematria}</span>`]);
    }
    rows.push(['מספר תוצאות שנמצאו', String(resultsCount)]);

    const rowsHtml = rows.map(([label, value]) =>
        `<tr><td class="label">${label}</td><td>${value}</td></tr>`
    ).join('');

    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><style>${EMAIL_STYLE}</style></head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <h1>מערכת מחשבון מחמאות</h1>
        <p>תוצאות החישוב שביקשת</p>
      </div>
      <div class="body">
        <h2>פרטי הבקשה</h2>
        <table class="details">${rowsHtml}</table>
        <p>הרשימה המלאה של כל התוצאות מצורפת למייל זה כקובץ Word.</p>
      </div>
      <div class="footer">
        נשלח על ידי מערכת מחשבון מחמאות &middot; פותח על ידי
        <a href="https://twitter.com/מייבין_במקצת">‎@מייבין במקצת</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * תוכן קובץ ה"וורד" (HTML מעוצב, RTL, עם סיומת .doc) - כולל את **כל**
 * פרטי הבקשה ורשימת התוצאות המלאה (עם פירוט גימטריה לכל תוצאה, במצב
 * חישוב גימטריה). זהו ה-HTML-to-Word trick: Word פותח קובצי HTML בעלי
 * סיומת .doc/.docx כמסמך רגיל, כי הוא מזהה את הפורמט לפי תוכן הקובץ
 * (magic bytes/markup) ולא רק לפי הסיומת.
 */
function buildResultsWordHtml({ name, gender, contentType, calcType, totalGematria, results }) {
    const rows = [
        ['שם', escapeHtml(name)],
        ['מין', escapeHtml(GENDER_LABELS[gender] || gender)],
        ['סוג תוכן', escapeHtml(CONTENT_TYPE_LABELS[contentType] || contentType)],
        ['סוג חישוב', escapeHtml(CALC_TYPE_LABELS[calcType] || calcType)],
    ];
    if (calcType === 'gematria' && totalGematria !== null && totalGematria !== undefined) {
        rows.push(['הגימטריה הכוללת של השם', `<span class="total">${totalGematria}</span>`]);
    }
    rows.push(['מספר תוצאות', String(results.length)]);

    const rowsHtml = rows.map(([label, value]) =>
        `<tr><td class="label">${label}</td><td>${value}</td></tr>`
    ).join('');

    const resultsHtml = results.map((item, idx) => {
        const detail = calcType === 'gematria'
            ? `<div class="detail">${escapeHtml(generateGematriaDetails(item).join(', '))}</div>`
            : '';
        return `<div class="result"><span class="idx">${idx + 1}.</span>${escapeHtml(item)}${detail}</div>`;
    }).join('');

    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>${EMAIL_STYLE}
    body { background:#ffffff; }
    .wrap { max-width:100%; padding:0; }
    .card { border:none; border-radius:0; box-shadow:none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <h1>מערכת מחשבון מחמאות</h1>
        <p>תוצאות מלאות</p>
      </div>
      <div class="body">
        <h2>פרטי הבקשה</h2>
        <table class="details">${rowsHtml}</table>
        <h2>התוצאות</h2>
        ${resultsHtml}
      </div>
      <div class="footer">
        נשלח על ידי מערכת מחשבון מחמאות &middot; פותח על ידי ‎@מייבין במקצת &middot;
        ${escapeHtml(new Date().toLocaleString('he-IL'))}
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * שולח את התוצאות למייל דרך Google Apps Script (Web App שנפרס כ"בצע
 * כמשתמש: אני" / "מי יכול לגשת: כל אחד") - ראו GOOGLE_APPS_SCRIPT.gs
 * ומדריך הפריסה המצורף. הכתובת (URL) וכל הסודות הנדרשים מגיעים ממשתני
 * סביבה של Vercel בלבד (לא מוטמעים בקוד):
 *   GOOGLE_SCRIPT_URL   - כתובת ה-Web App שנפרס (חובה)
 *   MAIL_SHARED_SECRET  - מחרוזת סוד משותפת לאימות הבקשה מול ה-Script (חובה)
 * שם התצוגה של השולח ("מערכת מחשבון מחמאות") מוגדר בתוך ה-Apps Script
 * עצמו (GmailApp.sendEmail עם הפרמטר name) - לא כאן, כדי שכתובת המייל
 * בפועל תישאר כתובת ה-Gmail/G Suite שמריץ את ה-Script (כנדרש).
 *
 * גוף המייל (bodyHtml) הוא HTML מעוצב (RTL) הכולל רק את פרטי הבקשה -
 * לא את רשימת התוצאות המלאה. הרשימה המלאה נשלחת כקובץ מצורף בפורמט
 * HTML מעוצב עם סיומת .doc (attachmentHtml) - כך ש-Word/Outlook פותחים
 * אותו כמסמך "וורד" מעוצב, למרות שבפועל זהו קובץ HTML (טריק ידוע).
 */
async function sendResultsByEmail({ toEmail, name, gender, contentType, calcType, totalGematria, results }) {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    const sharedSecret = process.env.MAIL_SHARED_SECRET || '';

    if (!scriptUrl) {
        throw new Error('GOOGLE_SCRIPT_URL לא הוגדר במשתני הסביבה של Vercel');
    }

    const resultsCount = results.length;
    const bodyHtml = buildEmailBodyHtml({ name, gender, contentType, calcType, totalGematria, resultsCount });
    const attachmentHtml = buildResultsWordHtml({ name, gender, contentType, calcType, totalGematria, results });
    const subject = `תוצאות מחשבון מחמאות - ${name}`;

    const payload = {
        secret: sharedSecret,
        toEmail,
        subject,
        bodyHtml,
        attachmentHtml,
        senderDisplayName: 'מערכת מחשבון מחמאות',
        // סיומת .doc בכוונה (לא .html) - זהו הטריק להצגת קובץ HTML מעוצב
        // כמסמך Word: Word/Outlook פותחים HTML עם סיומת .doc כמסמך רגיל.
        fileName: `gematria-results-${Date.now()}.doc`,
    };

    logStep('EMAIL_SEND_REQUEST', { toEmail, scriptUrlHost: safeHost(scriptUrl) });

    let response;
    try {
        response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'follow',
        });
    } catch (networkErr) {
        logStep('EMAIL_SEND_NETWORK_ERROR', { message: networkErr.message });
        throw new Error(`שגיאת רשת בפנייה לשירות שליחת המייל: ${networkErr.message}`);
    }

    const rawBody = await response.text();
    logStep('EMAIL_SEND_RESPONSE', { status: response.status, bodyPreview: rawBody.slice(0, 200) });

    let data;
    try {
        data = JSON.parse(rawBody);
    } catch (parseErr) {
        // Apps Script Web Apps מחזירים לעתים HTML (למשל דף התחברות/הרשאה)
        // אם ה-deployment לא הוגדר כ"כל אחד" - זה בדיוק אותו סוג בעיה
        // שגרמה לשגיאת ה-JSON בתמלול, ולכן חשוב לתעד את זה בבירור.
        throw new Error(
            `שירות שליחת המייל (Google Apps Script) החזיר תגובה לא תקינה ` +
            `(סטטוס ${response.status}). ייתכן שה-Web App לא פרוס עם הרשאת ` +
            `"כל אחד" (Anyone), או שכתובת ה-URL שגויה. תגובה גולמית: ${rawBody.slice(0, 150)}`
        );
    }

    if (!response.ok || data.ok !== true) {
        throw new Error(data.error || `שירות שליחת המייל החזיר שגיאה (סטטוס ${response.status})`);
    }
    return true;
}

function safeHost(url) {
    try { return new URL(url).host; } catch (e) { return 'invalid-url'; }
}

// ============================================================================
// אינטגרציה עם ימות: הורדת ההקלטה ושליחה לתמלול
// ============================================================================

/**
 * מוריד את בייטי ה-wav של ההקלטה מימות המשיח.
 * recordingRef הוא הערך שימות מחזיר בפרמטר ה-read (בד"כ נתיב/URL להקלטה,
 * תלוי בהגדרות המערכת - יש לוודא מול תיעוד ימות איזה ערך מוחזר בפועל
 * עבור קלט מסוג record, ולעדכן כאן את בניית ה-URL בהתאם אם צריך).
 */
async function downloadRecording(recordingRef, systemToken) {
  if (!recordingRef) {
    throw new Error('לא התקבל נתיב הקלטה');
  }

  if (!systemToken) {
    throw new Error('לא התקבל ApiToken/Token מימות עבור הורדת ההקלטה');
  }

  let url;

  // אם ימות החזיר URL מלא - משתמשים בו, אבל מוסיפים token
  // רק אם מדובר בכתובת DownloadFile של ימות.
  if (/^https?:\/\//i.test(recordingRef)) {
    const parsedUrl = new URL(recordingRef);

    if (
      parsedUrl.hostname === 'www.call2all.co.il' &&
      parsedUrl.pathname === '/ym/api/DownloadFile'
    ) {
      parsedUrl.searchParams.set('token', systemToken);

      // אם כבר קיים path, נוודא שהוא מתחיל ב-ivr2:
      const existingPath = parsedUrl.searchParams.get('path') || '';

      if (existingPath && !existingPath.startsWith('ivr2:')) {
        parsedUrl.searchParams.set('path', `ivr2:${existingPath}`);
      }

      url = parsedUrl.toString();
    } else {
      // URL חיצוני/ישיר - לא משנים אותו
      url = recordingRef;
    }
  } else {
    // recordingRef הוא נתיב שקיבלנו מימות.
    // DownloadFile דורש את הקידומת ivr2:
    const filePath = recordingRef.startsWith('ivr2:')
      ? recordingRef
      : `ivr2:${recordingRef}`;

    const params = new URLSearchParams({
      token: systemToken,
      path: filePath,
    });

    url = `https://www.call2all.co.il/ym/api/DownloadFile?${params.toString()}`;
  }

  logStep('DOWNLOAD_RECORDING_REQUEST', {
    // בכוונה לא רושמים את הטוקן עצמו ללוג
    url: url.replace(
      /([?&]token=)[^&]*/i,
      '$1[REDACTED]'
    ),
  });

  const response = await fetch(url);

  const contentType = response.headers.get('content-type') || '';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const bodyText = buffer.toString('utf8');

  console.log(JSON.stringify({
    event: 'RECORDING_DOWNLOAD_RESPONSE',
    status: response.status,
    contentType,
    bytes: buffer.length,
    firstBytes: buffer.subarray(0, 32).toString('hex'),
    bodyPreview: contentType.includes('json')
      ? bodyText.substring(0, 2000)
      : undefined
  }));

  if (!response.ok) {
    throw new Error(
      `Failed to download recording: HTTP ${response.status}`
    );
  }

  if (contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `ימות החזיר JSON במקום קובץ WAV: ${bodyText.substring(0, 1000)}`
    );
  }

  if (
    buffer.length < 12 ||
    buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buffer.subarray(8, 12).toString('ascii') !== 'WAVE'
  ) {
    throw new Error(
      `הקובץ שהתקבל אינו WAV תקין. bytes=${buffer.length}, content-type=${contentType}`
    );
  }

  return buffer;
}
/**
 * שולח את בייטי ה-wav לקובץ התמלול הנפרד (transcribe.py) בקריאת POST פנימית,
 * בדיוק כפי שמתואר בהערות הראש של transcribe.py המקורי.
 */
async function transcribeViaService(wavBytes) {
    const transcribeUrl = process.env.TRANSCRIBE_SERVICE_URL || '/api/yemot/transcribe';
    const fullUrl = transcribeUrl.startsWith('http')
        ? transcribeUrl
        : `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}${transcribeUrl}`;

    logStep('TRANSCRIBE_REQUEST', { url: fullUrl, bytes: wavBytes.length });

    let response;
    try {
        response = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'audio/wav' },
            body: wavBytes,
        });
    } catch (networkErr) {
        // כשל רשת/DNS/timeout בדרך אל ה-endpoint עצמו (לפני קבלת תגובה כלשהי)
        logStep('TRANSCRIBE_NETWORK_ERROR', { message: networkErr.message });
        throw new Error(`שגיאת רשת בפנייה לשירות התמלול: ${networkErr.message}`);
    }

    // קריאת הגוף כטקסט גולמי קודם - כדי לא להתפוצץ על JSON.parse אם חזר HTML
    // (למשל דף שגיאת 404/500 של Vercel כאשר ה-function של הפייתון לא זמינה,
    // נכשלה בפריסה, או חרגה מזמן ריצה - זה בדיוק המקור לשגיאה
    // "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" שדווחה).
    const rawBody = await response.text();
    const contentType = response.headers.get('content-type') || '';

    logStep('TRANSCRIBE_RESPONSE', {
        status: response.status,
        contentType,
        bodyPreview: rawBody.slice(0, 200),
    });

    if (!contentType.includes('application/json')) {
        // התגובה אינה JSON בכלל (סביר: דף שגיאת HTML של Vercel/פלטפורמה)
        throw new Error(
            `שירות התמלול החזיר תגובה לא תקינה (סטטוס ${response.status}, ` +
            `content-type: ${contentType || 'לא ידוע'}). ייתכן שה-function של הפייתון ` +
            `אינה פרוסה כראוי או נכשלה - יש לבדוק את הלוגים ב-Vercel עבור api/yemot/transcribe.`
        );
    }

    let data;
    try {
        data = JSON.parse(rawBody);
    } catch (parseErr) {
        throw new Error(`שגיאה בפענוח תגובת שירות התמלול (JSON לא תקין): ${parseErr.message}`);
    }

    if (!response.ok) {
        throw new Error(data.error || `שירות התמלול החזיר שגיאה (סטטוס ${response.status})`);
    }
    return (data.text || '').trim();
}
