'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/utils/trpc';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format, addDays, startOfDay, addMinutes, isBefore, isAfter } from 'date-fns';

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

interface TimeSlot {
  startTime: Date;
  endTime: Date;
  formatted: string;
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const username = params.username as string;
  const slug = params.slug as string;
  
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Fetch event type data
  const { data, isLoading, isError } = api.eventType.getBySlug.useQuery(
    { username, slug },
    {
      enabled: !!username && !!slug,
      retry: false,
    }
  );

  // Fetch schedule data
  const { data: scheduleData } = api.schedule.getDefaultSchedule.useQuery(
    undefined,
    {
      enabled: !!data?.eventType.userId,
    }
  );

  // Create booking mutation
  const createBooking = api.booking.create.useMutation({
    onSuccess: (data) => {
      router.push(`/${username}/${slug}/success?bookingId=${data.id}`);
    },
    onError: (error) => {
      setError(`Failed to create booking: ${error.message}`);
    },
  });

  // Set event type and user data when fetched
  useEffect(() => {
    if (isError) {
      setError('Event type not found');
      setLoading(false);
    } else if (data) {
      setEventType(data.eventType);
      setUser(data.user);
      setLoading(false);
    }
  }, [data, isError]);

  // Generate time slots based on schedule availability
  useEffect(() => {
    if (scheduleData && eventType) {
      const slots: TimeSlot[] = [];
      const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday
      
      // Find availability for the selected day
      const dayAvailability = scheduleData.availability.find(
        (avail) => avail.day === dayOfWeek
      );
      
      if (dayAvailability) {
        const [startHour, startMinute] = dayAvailability.startTime.split(':').map(Number);
        const [endHour, endMinute] = dayAvailability.endTime.split(':').map(Number);
        
        // Create a date object for the start time
        const startTime = new Date(selectedDate);
        startTime.setHours(startHour, startMinute, 0, 0);
        
        // Create a date object for the end time
        const endTime = new Date(selectedDate);
        endTime.setHours(endHour, endMinute, 0, 0);
        
        // Generate time slots based on event duration
        let currentSlotStart = new Date(startTime);
        
        while (isBefore(currentSlotStart, endTime)) {
          const currentSlotEnd = addMinutes(currentSlotStart, eventType.duration);
          
          // Only add the slot if it ends before or at the availability end time
          if (!isAfter(currentSlotEnd, endTime)) {
            slots.push({
              startTime: currentSlotStart,
              endTime: currentSlotEnd,
              formatted: format(currentSlotStart, 'h:mm a'),
            });
          }
          
          // Move to the next slot
          currentSlotStart = addMinutes(currentSlotStart, 30); // 30-minute increments
        }
      }
      
      setTimeSlots(slots);
    }
  }, [scheduleData, eventType, selectedDate]);

  // Handle date selection
  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  // Handle time slot selection
  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
  };

  // Handle booking submission
  const handleBookingSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedSlot || !eventType) {
      setError('Please select a time slot');
      return;
    }
    
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const notes = formData.get('notes') as string;
    
    if (!name || !email) {
      setError('Name and email are required');
      return;
    }
    
    createBooking.mutate({
      eventTypeId: eventType.id,
      startTime: selectedSlot.startTime.toISOString(),
      endTime: selectedSlot.endTime.toISOString(),
      title: eventType.title,
      description: notes,
      attendeeName: name,
      attendeeEmail: email,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  // Generate dates for the date picker (next 30 days)
  const generateDates = () => {
    const dates = [];
    const today = startOfDay(new Date());
    
    for (let i = 0; i < 30; i++) {
      const date = addDays(today, i);
      dates.push(date);
    }
    
    return dates;
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !eventType || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Type Not Found</h1>
          <p className="text-gray-600">{error || "The event type you're looking for doesn't exist."}</p>
          <Link href={`/${username}`} className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            View other event types
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row">
          {/* Event details sidebar */}
          <div className="w-full md:w-1/3 mb-8 md:mb-0 md:pr-8">
            <Link href={`/${username}`} className="text-blue-600 hover:text-blue-800 flex items-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Back
            </Link>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center mb-4">
                {user.image && (
                  <div className="mr-4">
                    <div className="relative h-10 w-10 rounded-full overflow-hidden">
                      <Image
                        src={user.image}
                        alt={user.name || 'User'}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                )}
                <h2 className="text-lg font-medium text-gray-900">{user.name}</h2>
              </div>
              
              <div className="border-t border-gray-200 pt-4">
                <h1 className="text-xl font-bold text-gray-900 mb-2">{eventType.title}</h1>
                {eventType.description && (
                  <p className="text-gray-600 mb-4">{eventType.description}</p>
                )}
                
                <div className="flex items-center text-gray-500 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <span>{eventType.duration} minutes</span>
                </div>
                
                <div className="flex items-center text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span>Web conferencing details provided upon confirmation</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Booking form */}
          <div className="w-full md:w-2/3">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Select a date & time</h2>
              
              {/* Date picker */}
              <div className="mb-6">
                <div className="flex overflow-x-auto pb-2 space-x-2">
                  {generateDates().map((date) => (
                    <button
                      key={date.toISOString()}
                      onClick={() => handleDateChange(date)}
                      className={`flex flex-col items-center justify-center p-2 rounded-md min-w-[70px] ${
                        selectedDate.toDateString() === date.toDateString()
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-white border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xs font-medium">{format(date, 'EEE')}</span>
                      <span className="text-lg font-bold">{format(date, 'd')}</span>
                      <span className="text-xs">{format(date, 'MMM')}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Time slots */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Available times for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </h3>
                
                {timeSlots.length === 0 ? (
                  <div className="text-center p-6 bg-gray-50 rounded-md">
                    <p className="text-gray-500">No available time slots for this day.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {timeSlots.map((slot, index) => (
                      <button
                        key={index}
                        onClick={() => handleSlotSelect(slot)}
                        className={`p-2 text-center rounded-md ${
                          selectedSlot === slot
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : 'bg-white border border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {slot.formatted}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Booking form */}
              {selectedSlot && (
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Enter your details
                  </h3>
                  
                  <form onSubmit={handleBookingSubmit} className="space-y-4">
                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                        {error}
                      </div>
                    )}
                    
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        defaultValue={session?.user?.name || ''}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        defaultValue={session?.user?.email || ''}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                        Additional notes
                      </label>
                      <textarea
                        id="notes"
                        name="notes"
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Please share anything that will help prepare for our meeting."
                      ></textarea>
                    </div>
                    
                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Confirm
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
