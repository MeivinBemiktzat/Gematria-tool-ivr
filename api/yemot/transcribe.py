"""
תמלול קול - מחשבון מחמאות (שלוחה 2, הקלטת שם)
====================================
פונקציית Vercel Python נפרדת מהמערכת הראשית (Node.js), אחראית אך ורק על
תמלול קובץ הקלטה (wav) לטקסט - שם המתקשר שהוקלט בשלוחה 2. הקוד ב-
api/yemot/index.js (Node.js) מוריד את ההקלטה מימות ושולח את בייטי ה-wav
הגולמיים ל-endpoint הזה בבקשת POST.

קובץ זה מותאם 1:1 מקובץ התמלול המקורי של הפרויקט הקודם (ראה הערות
מקוריות למטה) - לא נכתב מנגנון תמלול חדש, רק הותאם לשימוש במחשבון מחמאות.

שיטת התמלול: ספריית SpeechRecognition (PyPI), עם recognize_google() -
זו שיטת Google Web Speech API עם מפתח ברירת מחדל המוטמע בספרייה עצמה,
ולכן אינה דורשת הנפקת API key או חשבון Google Cloud. חשוב לדעת: זהו
שימוש לא-רשמי במפתח פנימי, ולכן אין ערבות רשמית לזמינות/יציבות ארוכת-טווח
מצד גוגל - מתאים לפרויקט בהיקף כזה, אך לא לשירות production בקנה מידה גדול.

ריפוד השקט: לפני שליחת האודיו לתמלול, מוסיפים חצי שנייה של שקט בתחילת
ובסוף ההקלטה - כדי שהתמלול לא "יבלע" חצאי מילים בקצוות ההקלטה (רלוונטי
במיוחד לשמות קצרים, שהם המקרה השכיח בשלוחה זו). זה נעשה כאן (בפייתון)
על בייטי ה-wav שהתקבלו, ולא בצד ימות.

הערה חשובה (תיקון): ריפוד השקט מבוצע כעת עם מודול ה-wave המובנה של
פייתון (stdlib) ולא עם pydub. הסיבה: pydub מסתמך על קריאה לתוכנת
ffmpeg/ffprobe חיצונית (subprocess), שאינה מותקנת בסביבת הריצה
הסטנדרטית של Vercel Python functions. כתוצאה מכך הפונקציה נכשלת
(או אפילו נכשלת כבר בשלב האתחול/build), ו-Vercel מחזיר את דף
ה-404/שגיאה הכללי של הפלטפורמה (HTML) במקום להריץ את הקוד - זה בדיוק
התואם לשגיאה "שירות התמלול החזיר תגובה לא תקינה... content-type:
text/html" שהתקבלה בפועל. מודול wave עובד ישירות על בייטי ה-PCM/WAV
ואינו תלוי בשום בינארי חיצוני, ולכן מתאים לריצה תחת Vercel.
"""

import io
import json

import speech_recognition as sr

# שפת התמלול - עברית (שמות מוקלטים בשלוחה 2 של מחשבון המחמאות)
TRANSCRIBE_LANGUAGE = 'he-IL'

# משך ריפוד השקט לפני/אחרי ההקלטה (מילישניות)
SILENCE_PADDING_MS = 500


def pad_with_silence(wav_bytes: bytes) -> bytes:
    """מוסיף שקט לפני ואחרי קובץ wav (ללא תלות ב-ffmpeg), ומחזיר בייטים של wav חדש."""
    import wave

    with wave.open(io.BytesIO(wav_bytes), 'rb') as src:
        n_channels = src.getnchannels()
        sample_width = src.getsampwidth()
        frame_rate = src.getframerate()
        n_frames = src.getnframes()
        audio_frames = src.readframes(n_frames)

    silence_n_frames = int(frame_rate * SILENCE_PADDING_MS / 1000)
    silence_frames = b'\x00' * (silence_n_frames * n_channels * sample_width)

    out = io.BytesIO()
    with wave.open(out, 'wb') as dst:
        dst.setnchannels(n_channels)
        dst.setsampwidth(sample_width)
        dst.setframerate(frame_rate)
        dst.writeframes(silence_frames + audio_frames + silence_frames)

    return out.getvalue()


def transcribe_wav_bytes(wav_bytes: bytes) -> str:
    """מתמלל בייטי wav לטקסט (שם המתקשר). מחזיר מחרוזת ריקה אם לא זוהה דיבור."""
    padded_bytes = pad_with_silence(wav_bytes)

    recognizer = sr.Recognizer()
    with sr.AudioFile(io.BytesIO(padded_bytes)) as source:
        audio_data = recognizer.record(source)

    try:
        text = recognizer.recognize_google(audio_data, language=TRANSCRIBE_LANGUAGE)
        return text.strip()
    except sr.UnknownValueError:
        # לא זוהה דיבור בהקלטה - לא שגיאה, פשוט אין תוצאה
        # ה-IVR (index.js) יבקש מהמתקשר להקליט שוב במקרה כזה
        return ''
    except sr.RequestError as exc:
        raise RuntimeError(f'שירות התמלול של גוגל לא זמין כרגע: {exc}') from exc


# --- Vercel Python serverless handler (BaseHTTPRequestHandler convention) ---
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            wav_bytes = self.rfile.read(content_length)

            if not wav_bytes:
                self._send_json(400, {'error': 'לא התקבל קובץ אודיו'})
                return

            text = transcribe_wav_bytes(wav_bytes)
            self._send_json(200, {'text': text})

        except Exception as exc:  # noqa: BLE001 - צריך להחזיר כל שגיאה כ-JSON ל-Node.js
            self._send_json(500, {'error': str(exc)})

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
