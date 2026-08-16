// רץ אוטומטית לפני npm run start:all: בונה מחדש את ה-Cloud Functions
// (כדי שקוד שהשתנה, למשל אחרי git pull, ייכנס לתוקף באמולטור), ואם
// עוד אין נתוני עסק דמו — מריץ את ההקמה הראשונית לבד, כדי שאי אפשר
// יהיה "לשכוח" להריץ npm run setup:demo קודם.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

console.log("בונה את ה-Cloud Functions...");
execSync("npm --prefix functions run build", { stdio: "inherit" });

if (!existsSync("emulator-data/firebase-export-metadata.json")) {
  console.log("לא נמצאו נתוני עסק דמו — מריץ הקמה ראשונית (npm run setup:demo)...");
  execSync("npm run setup:demo", { stdio: "inherit" });
}
