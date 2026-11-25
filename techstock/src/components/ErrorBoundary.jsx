import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Panel failed to render.', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="panel-error" role="alert">
          <h2>Something went wrong</h2>
          <p>This panel could not be displayed.</p>
          {this.state.error.message && <p className="subtle-note">{this.state.error.message}</p>}
          <button type="button" className="secondary-button" onClick={() => this.setState({ error: null })}>
            Reload panel
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
