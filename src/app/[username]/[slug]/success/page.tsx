'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/utils/trpc';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';

interface Booking {
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  attendeeName: string;
  attendeeEmail: string;
  status: string;
  eventType: {
    title: string;
    user: {
      name: string | null;
      email: string | null;
      image: string | null;
    };
  };
}

export default function BookingSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const username = params.username as string;
  const slug = params.slug as string;
  const bookingId = searchParams.get('bookingId');
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch booking data
  const { data, isLoading, isError } = api.booking.getById.useQuery(
    { id: bookingId as string },
    {
      enabled: !!bookingId,
      retry: false,
    }
  );

  // Set booking data when fetched
  useEffect(() => {
    if (isError) {
      setError('Booking not found');
      setLoading(false);
    } else if (data) {
      setBooking(data as unknown as Booking);
      setLoading(false);
    }
  }, [data, isError]);

  // Redirect if no booking ID provided
  useEffect(() => {
    if (!bookingId) {
      router.push(`/${username}/${slug}`);
    }
  }, [bookingId, router, username, slug]);

  // Format date for display
  const formatDate = (date: Date) => {
    return format(new Date(date), 'EEEE, MMMM d, yyyy');
  };

  // Format time for display
  const formatTime = (date: Date) => {
    return format(new Date(date), 'h:mm a');
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Not Found</h1>
          <p className="text-gray-600">{error || "The booking you're looking for doesn't exist."}</p>
          <Link href={`/${username}/${slug}`} className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            Book another appointment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed</h1>
            <p className="text-gray-600">You&apos;re scheduled with {booking.eventType.user.name}</p>
          </div>
          
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">{booking.title}</h2>
            
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">{formatDate(booking.startTime)}</p>
                  <p className="text-sm text-gray-500">
                    {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">{booking.attendeeName}</p>
                  <p className="text-sm text-gray-500">{booking.attendeeEmail}</p>
                </div>
              </div>
              
              {booking.description && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Additional information</p>
                    <p className="text-sm text-gray-500">{booking.description}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="border-t border-gray-200 pt-6 mt-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                {booking.eventType.user.image && (
                  <div className="mr-3">
                    <div className="relative h-10 w-10 rounded-full overflow-hidden">
                      <Image
                        src={booking.eventType.user.image}
                        alt={booking.eventType.user.name || 'User'}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">{booking.eventType.user.name}</p>
                  <p className="text-sm text-gray-500">{booking.eventType.user.email}</p>
                </div>
              </div>
              
              <Link
                href={`/${username}`}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Book another
              </Link>
            </div>
          </div>
          
          <div className="border-t border-gray-200 pt-6 mt-6 text-center">
            <p className="text-sm text-gray-500">
              A calendar invitation has been sent to your email address.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
