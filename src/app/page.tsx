"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import NavBar from '@/components/nav-bar';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  useEffect(() => {
    if (status === "loading") return;
    
    if (!session) {
      // If no user is logged in, redirect to login page
      router.push("/auth/signin");
    } else if (session.user.role === "SUPER_ADMIN") {
      // Redirect Super Admin to their dashboard
      router.push("/super-admin");
    } else if (session.user.role === "OWNER") {
      // Redirect Owner to their dashboard
      router.push("/admin");
    } else if (session.user.role === "ADMIN") {
      // Redirect base users to the user dashboard
      router.push("/dashboard");
    } else if (session.user.role === "LOCATION_ADMIN") {
      // Redirect location admins to their dashboard
      router.push("/location-admin");
    } else {
      // Fallback for any other case - should not happen
      console.warn("Unknown user role:", session.user.role);
      router.push("/login");
    }
  }, [router, session, status]);

  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center">
            <div className="lg:w-1/2 lg:pr-12 mb-10 lg:mb-0">
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
                Scheduling made <span className="text-blue-600">simple</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Connect with others efficiently. Create your booking page, share your link, and let others schedule meetings with you.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/auth/signup"
                  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors text-center"
                >
                  Get Started for Free
                </Link>
                <Link
                  href="/auth/signin"
                  className="px-6 py-3 bg-white text-blue-600 font-medium rounded-md border border-blue-600 hover:bg-blue-50 transition-colors text-center"
                >
                  Sign In
                </Link>
              </div>
            </div>
            <div className="lg:w-1/2">
              <div className="relative h-[400px] w-full">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-blue-100 rounded-lg p-8 w-full max-w-md">
                    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800">April 2025</h3>
                        <div className="flex space-x-2">
                          <button className="p-1 rounded hover:bg-gray-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button className="p-1 rounded hover:bg-gray-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-2 text-center">
                        <div className="text-xs font-medium text-gray-500">Su</div>
                        <div className="text-xs font-medium text-gray-500">Mo</div>
                        <div className="text-xs font-medium text-gray-500">Tu</div>
                        <div className="text-xs font-medium text-gray-500">We</div>
                        <div className="text-xs font-medium text-gray-500">Th</div>
                        <div className="text-xs font-medium text-gray-500">Fr</div>
                        <div className="text-xs font-medium text-gray-500">Sa</div>
                        
                        <div className="text-sm p-1 text-gray-400">28</div>
                        <div className="text-sm p-1 text-gray-400">29</div>
                        <div className="text-sm p-1 text-gray-400">30</div>
                        <div className="text-sm p-1 text-gray-400">31</div>
                        <div className="text-sm p-1">1</div>
                        <div className="text-sm p-1">2</div>
                        <div className="text-sm p-1">3</div>
                        
                        <div className="text-sm p-1">4</div>
                        <div className="text-sm p-1">5</div>
                        <div className="text-sm p-1">6</div>
                        <div className="text-sm p-1">7</div>
                        <div className="text-sm p-1">8</div>
                        <div className="text-sm p-1">9</div>
                        <div className="text-sm p-1">10</div>
                        
                        <div className="text-sm p-1">11</div>
                        <div className="text-sm p-1 bg-blue-600 text-white rounded-full">12</div>
                        <div className="text-sm p-1 bg-blue-100 text-blue-800 rounded">13</div>
                        <div className="text-sm p-1">14</div>
                        <div className="text-sm p-1">15</div>
                        <div className="text-sm p-1">16</div>
                        <div className="text-sm p-1">17</div>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-md p-4">
                      <h4 className="font-medium text-gray-800 mb-2">Available Times</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <button className="p-2 text-sm bg-white border border-gray-200 rounded hover:bg-gray-50">9:00 AM</button>
                        <button className="p-2 text-sm bg-white border border-gray-200 rounded hover:bg-gray-50">10:00 AM</button>
                        <button className="p-2 text-sm bg-white border border-gray-200 rounded hover:bg-gray-50">11:00 AM</button>
                        <button className="p-2 text-sm bg-blue-100 text-blue-800 border border-blue-300 rounded">1:00 PM</button>
                        <button className="p-2 text-sm bg-white border border-gray-200 rounded hover:bg-gray-50">2:00 PM</button>
                        <button className="p-2 text-sm bg-white border border-gray-200 rounded hover:bg-gray-50">3:00 PM</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Our appointment scheduling app simplifies the booking process for you and your clients.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-blue-600 font-bold text-xl">1</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Create Event Types</h3>
              <p className="text-gray-600">
                Define different types of meetings with customizable durations and availability.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-blue-600 font-bold text-xl">2</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Share Your Link</h3>
              <p className="text-gray-600">
                Send your personalized booking link to clients, colleagues, or friends.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-blue-600 font-bold text-xl">3</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Get Booked</h3>
              <p className="text-gray-600">
                Receive bookings that automatically sync with your calendar and availability.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="bg-blue-600 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Ready to simplify your scheduling?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Join thousands of professionals who use our platform to manage their appointments efficiently.
          </p>
          <Link
            href="/auth/signup"
            className="px-8 py-4 bg-white text-blue-600 font-medium rounded-md hover:bg-blue-50 transition-colors inline-block"
          >
            Create Your Free Account
          </Link>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="bg-gray-50 py-12 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <h3 className="text-xl font-bold text-gray-900">SimpleMeet</h3>
              <p className="text-gray-600">Scheduling made simple</p>
            </div>
            <div className="flex space-x-6">
              <Link href="/auth/signin" className="text-gray-600 hover:text-blue-600">
                Sign In
              </Link>
              <Link href="/auth/signup" className="text-gray-600 hover:text-blue-600">
                Sign Up
              </Link>
              <a href="#" className="text-gray-600 hover:text-blue-600">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-600 hover:text-blue-600">
                Terms of Service
              </a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-200 text-center text-gray-500">
            <p> {new Date().getFullYear()} SimpleMeet. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
