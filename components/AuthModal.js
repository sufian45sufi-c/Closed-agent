import { useState, useEffect } from "react";

export default function AuthModal({ isOpen, onClose, startInSignUp = false }) {
  const [isSignUp, setIsSignUp] = useState(startInSignUp);
  const [form, setForm] = useState({ username: "", email: "", password: "" });

  // Reset mode whenever the modal is (re)opened
  useEffect(() => {
    if (isOpen) setIsSignUp(startInSignUp);
  }, [isOpen, startInSignUp]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = () => {
    // Placeholder — will connect to real auth (NextAuth, Supabase, etc.) later
    console.log(isSignUp ? "Sign up:" : "Log in:", form);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-neutral-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-neutral-200 p-8 md:p-12 shadow-xl rounded-lg relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors text-sm"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="mb-10 text-lg font-bold tracking-tight">Weby.</div>

        <h1
          className="text-4xl mb-8"
          style={{ fontFamily: "'EB Garamond', serif" }}
        >
          {isSignUp ? "Create account." : "Welcome back."}
        </h1>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {isSignUp && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                Username
              </label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                className="w-full border border-neutral-200 bg-transparent px-4 py-3 rounded focus:outline-none focus:border-neutral-400 transition-colors"
                placeholder="johndoe"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full border border-neutral-200 bg-transparent px-4 py-3 rounded focus:outline-none focus:border-neutral-400 transition-colors"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className="w-full border border-neutral-200 bg-transparent px-4 py-3 rounded focus:outline-none focus:border-neutral-400 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-neutral-900 text-white py-3 rounded hover:bg-neutral-700 transition-all text-sm font-medium"
          >
            Continue
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-[1px] bg-neutral-200 flex-1"></div>
          <span className="text-[10px] uppercase text-neutral-400">Or</span>
          <div className="h-[1px] bg-neutral-200 flex-1"></div>
        </div>

        <div className="space-y-3">
          <button className="w-full border border-neutral-200 py-3 rounded text-sm hover:bg-neutral-50 transition-colors">
            Continue with Google
          </button>
          <button className="w-full border border-neutral-200 py-3 rounded text-sm hover:bg-neutral-50 transition-colors">
            Continue with GitHub
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-neutral-100 text-center">
          <p className="text-xs text-neutral-500">
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-neutral-900 underline underline-offset-4 font-medium"
            >
              {isSignUp ? "Log in" : "Sign up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
