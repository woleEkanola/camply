'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

interface AuthFormProps {
  mode: 'signin' | 'signup';
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'email' | 'otp' | 'profile'>('email');
  const [otp, setOtp] = useState('');
  const [verified, setVerified] = useState(false);
  const [profileStep, setProfileStep] = useState(false);

  const router = useRouter();

  const isSignIn = mode === 'signin';
  const buttonText = isSignIn ? 'Sign In' : 'Sign Up';
  const toggleText = isSignIn 
    ? 'Don\'t have an account? Sign Up' 
    : 'Already have an account? Sign In';
  const toggleLink = isSignIn ? '/auth/signup' : '/auth/signin';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      if (isSignIn) {
        // Sign in logic
        const result = await signIn('credentials', {
          redirect: false,
          email,
          password,
        });
        
        if (result?.error) {
          setError('Invalid email or password');
          setIsLoading(false);
          return;
        }
        
        router.push('/');
        router.refresh();
      } else {
        if (step === 'email') {
          // Send OTP with email only
          const res = await fetch('/api/base-user/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message || 'Error sending OTP');
            setIsLoading(false);
            return;
          }
          setStep('otp');
          setIsLoading(false);
        } else if (step === 'otp') {
          // Verify OTP
          const res = await fetch('/api/base-user/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message || 'Invalid or expired OTP');
            setIsLoading(false);
            return;
          }
          setVerified(true);
          setStep('profile');
          setIsLoading(false);
        } else {
          // Sign up logic
          const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              email,
              password,
            }),
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.message || 'Something went wrong!');
          }
          
          // Automatically sign in after successful sign up
          await signIn('credentials', {
            redirect: false,
            email,
            password,
          });
          
          // We don't need to check result here as we're redirecting anyway
          
          router.push('/');
          router.refresh();
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
    
    setIsLoading(false);
  }

  if (mode === 'signup' && step === 'email') {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Create an Account</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{error}</div>
        )}
        <form onSubmit={async (e) => {
          e.preventDefault();
          setIsLoading(true);
          setError('');
          // Send OTP with email only
          const res = await fetch('/api/base-user/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message || 'Error sending OTP');
            setIsLoading(false);
            return;
          }
          setStep('otp');
          setIsLoading(false);
        }}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Loading...' : 'Continue'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link href="/auth/signin" className="text-sm text-blue-600 hover:text-blue-800">
            Already have an account? Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (mode === 'signup' && step === 'otp') {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Verify Email</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{error}</div>
        )}
        <form onSubmit={async (e) => {
          e.preventDefault();
          setIsLoading(true);
          setError('');
          // Verify OTP
          const res = await fetch('/api/base-user/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message || 'Invalid or expired OTP');
            setIsLoading(false);
            return;
          }
          setVerified(true);
          setStep('profile');
          setIsLoading(false);
        }}>
          <div className="mb-4">
            <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>
      </div>
    );
  }

  if (mode === 'signup' && step === 'profile') {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Complete Your Profile</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{error}</div>
        )}
        <form onSubmit={async (e) => {
          e.preventDefault();
          setIsLoading(true);
          setError('');
          // Update profile logic
          const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              email,
              password,
            }),
          });
          const data = await response.json();
          if (!response.ok) {
            setError(data.message || 'Something went wrong!');
            setIsLoading(false);
            return;
          }
          await signIn('credentials', {
            redirect: false,
            email,
            password,
          });
          setIsLoading(false);
          router.push('/');
          router.refresh();
        }}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Submitting...' : 'Complete Signup'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {isSignIn ? 'Sign In' : 'Create an Account'}
      </h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
        {error}
      </div>
      )}
      
      <form onSubmit={handleSubmit}>
        {!isSignIn && (
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        )}
        
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        <div className="mb-6">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            minLength={6}
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : buttonText}
        </button>
      </form>
      
      <div className="mt-4 text-center">
        <Link href={toggleLink} className="text-sm text-blue-600 hover:text-blue-800">
          {toggleText}
        </Link>
      </div>
    </div>
  );
}
