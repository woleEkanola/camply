'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/utils/trpc';
import { useSession } from 'next-auth/react';

interface EventTypeFormProps {
  eventTypeId?: string;
}

export default function EventTypeForm({ eventTypeId }: EventTypeFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    duration: 30,
    color: '#3B82F6', // Default blue color
    isHidden: false,
  });
  
  // Fetch event type data if editing
  const { data: eventType, isLoading } = api.eventType.getById.useQuery(
    { id: eventTypeId! },
    { enabled: !!eventTypeId && !!session }
  );
  
  // Create event type mutation
  const createEventType = api.eventType.create.useMutation({
    onSuccess: () => {
      router.push('/dashboard/event-types');
    },
    onError: (error) => {
      setError(error.message);
      setIsSubmitting(false);
    },
  });
  
  // Update event type mutation
  const updateEventType = api.eventType.update.useMutation({
    onSuccess: () => {
      router.push('/dashboard/event-types');
    },
    onError: (error) => {
      setError(error.message);
      setIsSubmitting(false);
    },
  });
  
  // Populate form with event type data when editing
  useEffect(() => {
    if (eventType) {
      setFormData({
        title: eventType.title,
        slug: eventType.slug,
        description: eventType.description || '',
        duration: eventType.duration,
        color: eventType.color || '#3B82F6',
        isHidden: eventType.hidden || false,
      });
    }
  }, [eventType]);
  
  // Generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '');
  };
  
  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (name === 'title' && !formData.slug) {
      // Auto-generate slug when title changes and slug is empty
      setFormData({
        ...formData,
        title: value,
        slug: generateSlug(value),
      });
    } else {
      setFormData({
        ...formData,
        [name]: type === 'checkbox' 
          ? (e.target as HTMLInputElement).checked 
          : value,
      });
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    
    try {
      if (eventTypeId) {
        // Update existing event type
        updateEventType.mutate({
          id: eventTypeId,
          ...formData,
          duration: Number(formData.duration),
        });
      } else {
        // Create new event type
        createEventType.mutate({
          ...formData,
          duration: Number(formData.duration),
        });
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 mb-4">
          {error}
        </div>
      )}
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          type="text"
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Meeting, Interview, Coffee Chat, etc."
        />
      </div>
      
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
          URL Slug
        </label>
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">
            {typeof window !== 'undefined' ? `${window.location.origin}/${session?.user?.name}/` : '/'}
          </span>
          <input
            type="text"
            id="slug"
            name="slug"
            value={formData.slug}
            onChange={handleChange}
            required
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="meeting"
          />
        </div>
      </div>
      
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="A brief description of your event type"
        ></textarea>
      </div>
      
      <div>
        <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
          Duration
        </label>
        <select
          id="duration"
          name="duration"
          value={formData.duration}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="45">45 minutes</option>
          <option value="60">60 minutes</option>
          <option value="90">90 minutes</option>
          <option value="120">2 hours</option>
        </select>
      </div>
      
      <div>
        <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
          Color
        </label>
        <div className="flex items-center">
          <input
            type="color"
            id="color"
            name="color"
            value={formData.color}
            onChange={handleChange}
            className="h-10 w-10 border border-gray-300 rounded-md mr-2"
          />
          <input
            type="text"
            value={formData.color}
            onChange={handleChange}
            name="color"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      
      <div className="flex items-center">
        <input
          type="checkbox"
          id="isHidden"
          name="isHidden"
          checked={formData.isHidden}
          onChange={(e) => setFormData({ ...formData, isHidden: e.target.checked })}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="isHidden" className="ml-2 block text-sm text-gray-700">
          Hide this event type from your booking page
        </label>
      </div>
      
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={() => router.push('/dashboard/event-types')}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? 'Saving...'
            : eventTypeId
            ? 'Update Event Type'
            : 'Create Event Type'}
        </button>
      </div>
    </form>
  );
}
