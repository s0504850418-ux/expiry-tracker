import { useEffect, useState } from "react";

/**
 * מצב חיבור לרשת — לפי navigator.onLine + אירועי online/offline של
 * הדפדפן. פעולות שדורשות Cloud Function (כתיבה) צריכות להיחסם כשאין
 * חיבור; קריאה בלבד (רשימת אצוות שכבר נטענה) ממשיכה לעבוד דרך
 * Firestore persistence המובנה.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
