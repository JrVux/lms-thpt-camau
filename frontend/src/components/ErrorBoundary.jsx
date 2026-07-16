import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-lg mx-4">
            <h2 className="text-lg font-bold text-red-700 mb-2">Có lỗi xảy ra</h2>
            <p className="text-sm text-red-600 mb-3">{this.state.error.message}</p>
            <pre className="text-xs text-red-500 bg-red-100 p-3 rounded overflow-auto max-h-40">
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}