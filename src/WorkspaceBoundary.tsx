import { Component, Suspense, type ReactNode } from "react";
import { LoadingIndicator } from "./LoadingIndicator";

/** Keep navigation available while a workspace loads or fails to download. */
export class WorkspaceBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert">
          <p className="form-status">Не удалось открыть раздел. Обновите страницу и попробуйте ещё раз.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Обновить страницу
          </button>
        </div>
      );
    }

    return (
      <Suspense fallback={<LoadingIndicator label="Загружаем раздел…" variant="panel" />}>
        {this.props.children}
      </Suspense>
    );
  }
}
