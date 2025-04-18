'use client';

import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-red-600">
          Authentication Error
        </h2>
        <p className="mb-6 text-center text-gray-700">
          There was a problem with your authentication. Please try again.
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            href="/auth/signin"
            className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
