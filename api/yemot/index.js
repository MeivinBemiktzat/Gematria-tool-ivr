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
function buildRead({ mbId, ttsText, mode = 'tap', maxDigits = 1, minDigits = 1, valName }) {
    const label = valName || mbId;
    const message = `t-${esc(ttsText)}`;
    let options;
    if (mode === 'tap') {
        // val_name,re_enter,max_digits,min_digits,sec_wait,typing_mode,...
        options = `${label},,${maxDigits},${minDigits},,No`;
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

function respond(res, body) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(body);
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

        if (!callId) {
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
            return respond(res, buildRead({
                mbId: MB.MENU_NAME_INPUT,
                ttsText: 'ברוכים הבאים למחשבון מחמאות. להקלדת שם באמצעות המקלדת הקישו 1. להקלטת שם הקישו 2.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        return await handleStep(state, query, stateKey, res, did);

    } catch (err) {
        console.error('IVR error:', err);
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

async function handleStep(state, query, stateKey, res, did) {
    switch (state.step) {

        case 'MENU_NAME_METHOD': {
            const choice = query[MB.MENU_NAME_INPUT];
            if (choice === '1') {
                state.step = 'TYPE_NAME';
                setState(stateKey, state);
                return respond(res, buildRead({
                    mbId: MB.ASK_TYPE_NAME_TEXT,
                    ttsText: 'אנא הקלידו את שמכם באמצעות המקלדת, ובסיום הקישו סולמית.',
                    mode: 'tap',
                    maxDigits: 30,
                    minDigits: 1,
                }));
            } else if (choice === '2') {
                state.step = 'RECORD_NAME';
                setState(stateKey, state);
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
            state.step = 'ASK_GENDER';
            setState(stateKey, state);
            return respond(res, buildRead({
                mbId: MB.ASK_GENDER,
                ttsText: 'לחישוב עבור זכר הקישו 1. לחישוב עבור נקבה הקישו 2.',
                mode: 'tap',
                maxDigits: 1,
            }));
        }

        // שלוחה 2: הקלטת שם -> תמלול -> אישור
        case 'RECORD_NAME': {
            const recordingPath = query[MB.ASK_RECORD_NAME]; // נתיב/URL להקלטה בימות
            if (!recordingPath) {
                return respond(res, buildRead({
                    mbId: MB.INVALID_INPUT,
                    ttsText: 'לא התקבלה הקלטה, אנא נסו שוב.',
                    mode: 'none',
                }) + '&' + buildGoTo('/'));
            }

            let transcribedText = '';
            try {
                const wavBytes = await downloadRecording(recordingPath);
                transcribedText = await transcribeViaService(wavBytes);
            } catch (err) {
                console.error('Transcription error:', err);
                transcribedText = '';
            }

            if (!transcribedText) {
                state.step = 'RECORD_NAME';
                setState(stateKey, state);
                return respond(res, buildRead({
                    mbId: MB.TRANSCRIBE_FAILED,
                    ttsText: 'לא הצלחנו לזהות את השם בהקלטה. אנא הקליטו שוב את שמכם ובסיום הקישו סולמית.',
                    mode: 'record',
                }));
            }

            state.pendingName = transcribedText;
            state.step = 'CONFIRM_TRANSCRIPTION';
            setState(stateKey, state);
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
                state.step = 'ASK_GENDER';
                setState(stateKey, state);
                return respond(res, buildRead({
                    mbId: MB.ASK_GENDER,
                    ttsText: 'לחישוב עבור זכר הקישו 1. לחישוב עבור נקבה הקישו 2.',
                    mode: 'tap',
                    maxDigits: 1,
                }));
            } else if (choice === '2') {
                state.step = 'RECORD_NAME';
                setState(stateKey, state);
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

        // בחירת זכר/נקבה - כפי שה-HTML דורש (select#gender) לפני החישוב
        case 'ASK_GENDER': {
            const choice = query[MB.ASK_GENDER];
            if (choice === '1' || choice === '2') {
                state.gender = choice === '1' ? 'male' : 'female';
                state.step = 'ASK_CONTENT_TYPE';
                setState(stateKey, state);
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
            state.step = 'ASK_CALC_TYPE';
            setState(stateKey, state);
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
            } catch (err) {
                console.error('Content load error:', err);
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
            state.step = 'PLAY_RESULTS';
            setState(stateKey, state);

            if (results.length === 0) {
                state.step = 'MENU_NAME_METHOD_END';
                setState(stateKey, state);
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
                state.step = 'AFTER_RESULT';
                setState(stateKey, state);
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
                    ttsText: `פירוט הגימטריה: ${detailLines.join(', ')}`,
                    mode: 'none',
                }) + '&' + buildGoTo('.'));
            } else if (choice === '2') {
                // תוצאה הבאה
                if (idx + 1 < state.results.length) {
                    state.resultIndex = idx + 1;
                    state.step = 'PLAY_RESULTS';
                    setState(stateKey, state);
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
                ttsText: 'לשמיעת פירוט הגימטריה הקישו 1. לתוצאה הבאה הקישו 2. לסיום הקישו 9.',
                mode: 'tap',
                maxDigits: 1,
            }));
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
// אינטגרציה עם ימות: הורדת ההקלטה ושליחה לתמלול
// ============================================================================

/**
 * מוריד את בייטי ה-wav של ההקלטה מימות המשיח.
 * recordingRef הוא הערך שימות מחזיר בפרמטר ה-read (בד"כ נתיב/URL להקלטה,
 * תלוי בהגדרות המערכת - יש לוודא מול תיעוד ימות איזה ערך מוחזר בפועל
 * עבור קלט מסוג record, ולעדכן כאן את בניית ה-URL בהתאם אם צריך).
 */
async function downloadRecording(recordingRef) {
    let url = recordingRef;
    if (!/^https?:\/\//i.test(recordingRef)) {
        // אם הוחזר נתיב יחסי - יש לבנות URL מלא להורדה מול שרתי ימות
        url = `https://www.call2all.co.il/ym/api/DownloadFile?path=${encodeURIComponent(recordingRef)}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download recording: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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

    const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: wavBytes,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Transcription service error');
    }
    return (data.text || '').trim();
}
