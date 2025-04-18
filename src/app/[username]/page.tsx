'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/utils/trpc';
import Link from 'next/link';
import Image from 'next/image';

interface EventType {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  duration: number;
  color: string | null;
}

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [user, setUser] = useState<User | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch user's event types
  const { data, isLoading, isError } = api.eventType.getByUser.useQuery(
    { username },
    {
      enabled: !!username,
      retry: false,
    }
  );

  useEffect(() => {
    if (isError) {
      setError('User not found or has no public event types');
      setLoading(false);
    } else if (data) {
      setUser(data.user);
      setEventTypes(data.eventTypes);
      setLoading(false);
    }
  }, [data, isError]);

  // Format duration in minutes to hours and minutes
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} hr`;
    }
    
    return `${hours} hr ${remainingMinutes} min`;
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">User Not Found</h1>
          <p className="text-gray-600">The user you're looking for doesn't exist or has no public event types.</p>
          <Link href="/" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <div className="flex flex-col md:flex-row items-center md:items-start">
            {user.image && (
              <div className="mb-4 md:mb-0 md:mr-6">
                <div className="relative h-20 w-20 rounded-full overflow-hidden">
                  <Image
                    src={user.image}
                    alt={user.name || 'User'}
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
            )}
            <div className="text-center md:text-left">
              <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
              <p className="text-gray-600 mt-1">Schedule a time to meet</p>
            </div>
          </div>
        </div>

        <h2 className="text-lg font-medium text-gray-900 mb-4">Select an event type</h2>
        
        {eventTypes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-600">This user has no available event types.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {eventTypes.map((eventType) => (
              <Link
                key={eventType.id}
                href={`/${username}/${eventType.slug}`}
                className="block bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="p-6 flex flex-col md:flex-row md:items-center md:justify-between">
                  <div className="mb-4 md:mb-0">
                    <div 
                      className="w-3 h-3 rounded-full mb-2 md:hidden" 
                      style={{ backgroundColor: eventType.color || '#3B82F6' }}
                    ></div>
                    <div className="flex items-center">
                      <div 
                        className="hidden md:block w-3 h-3 rounded-full mr-3" 
                        style={{ backgroundColor: eventType.color || '#3B82F6' }}
                      ></div>
                      <h3 className="text-lg font-medium text-gray-900">{eventType.title}</h3>
                    </div>
                    {eventType.description && (
                      <p className="text-gray-600 mt-1">{eventType.description}</p>
                    )}
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500">{formatDuration(eventType.duration)}</span>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-5 w-5 ml-2 text-gray-400" 
                      viewBox="0 0 20 20" 
                      fill="currentColor"
                    >
                      <path 
                        fillRule="evenodd" 
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" 
                        clipRule="evenodd" 
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
