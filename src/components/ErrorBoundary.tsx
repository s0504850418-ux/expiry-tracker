import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// רשת הביטחון האחרונה: בלי error boundary, שגיאת רינדור לא-צפויה
// בכל מקום בעץ (למשל API שלא זמין ב-secure context מסוים) מקריסה את
// כל האפליקציה לדף לבן ריק, בלי שום מסר לעובד/ת המטבח שרואה את זה.
// לא ניתן לממש עם hook — React דורש class component ל-error boundary.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main dir="rtl" className="login-screen">
          <p className="error-text">משהו השתבש בטעינת המסך.</p>
          <button type="button" onClick={() => window.location.reload()}>
            רענון הדף
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
