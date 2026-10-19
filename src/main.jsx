import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/Auth";
import "./index.css";
class Boundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>تعذر عرض التطبيق</h1>
        <button onClick={() => location.reload()}>إعادة المحاولة</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <Boundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </Boundary>,
);
