import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#181828] text-white p-4">
          <div className="max-w-2xl w-full bg-slate-900 rounded-2xl p-8 border border-red-500/30">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong.</h1>
            <p className="text-slate-400 mb-6">An unexpected error occurred in the application view.</p>
            
            <div className="bg-black/50 p-4 rounded-xl overflow-auto text-sm text-red-300 font-mono max-h-64 mb-6">
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>

            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}
