import { Component, type ReactNode } from 'react';

/** Catches render errors from a model-written UI so one bad spec can't crash the chat. */
export class GenUIBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { children: ReactNode }) {
    // A newer spec (more of the stream, or a revision) gets another chance to render.
    if (this.state.failed && prev.children !== this.props.children) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
