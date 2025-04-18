'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/utils/trpc';
import { useSession } from 'next-auth/react';

interface ScheduleFormProps {
  scheduleId?: string;
}

interface AvailabilityItem {
  id?: string;
  day: number;
  startTime: string;
  endTime: string;
  isNew?: boolean;
}

export default function ScheduleForm({ scheduleId }: ScheduleFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isDefault: false,
  });
  
  // Availability state
  const [availability, setAvailability] = useState<AvailabilityItem[]>([]);
  const [availabilityToDelete, setAvailabilityToDelete] = useState<string[]>([]);
  
  // Fetch schedule data if editing
  const { data: schedule, isLoading } = api.schedule.getById.useQuery(
    { id: scheduleId! },
    { enabled: !!scheduleId && !!session }
  );
  
  // Create schedule mutation
  const createSchedule = api.schedule.create.useMutation({
    onSuccess: (data) => {
      // After creating the schedule, create availability items
      if (availability.length > 0) {
        Promise.all(
          availability.map((item) =>
            createAvailability.mutateAsync({
              scheduleId: data.id,
              day: item.day,
              startTime: item.startTime,
              endTime: item.endTime,
            })
          )
        )
          .then(() => {
            router.push('/dashboard/schedules');
          })
          .catch((err) => {
            setError('Failed to create availability: ' + err.message);
            setIsSubmitting(false);
          });
      } else {
        router.push('/dashboard/schedules');
      }
    },
    onError: (error) => {
      setError(error.message);
      setIsSubmitting(false);
    },
  });
  
  // Update schedule mutation
  const updateSchedule = api.schedule.update.useMutation({
    onSuccess: (data) => {
      // Handle availability updates
      const promises = [];
      
      // Create new availability items
      const newItems = availability.filter((item) => item.isNew);
      if (newItems.length > 0) {
        promises.push(
          ...newItems.map((item) =>
            createAvailability.mutateAsync({
              scheduleId: data.id,
              day: item.day,
              startTime: item.startTime,
              endTime: item.endTime,
            })
          )
        );
      }
      
      // Update existing availability items
      const existingItems = availability.filter((item) => !item.isNew && item.id);
      if (existingItems.length > 0) {
        promises.push(
          ...existingItems.map((item) =>
            updateAvailability.mutateAsync({
              id: item.id!,
              day: item.day,
              startTime: item.startTime,
              endTime: item.endTime,
            })
          )
        );
      }
      
      // Delete availability items
      if (availabilityToDelete.length > 0) {
        promises.push(
          ...availabilityToDelete.map((id) =>
            deleteAvailability.mutateAsync({ id })
          )
        );
      }
      
      // Wait for all operations to complete
      Promise.all(promises)
        .then(() => {
          router.push('/dashboard/schedules');
        })
        .catch((err) => {
          setError('Failed to update availability: ' + err.message);
          setIsSubmitting(false);
        });
    },
    onError: (error) => {
      setError(error.message);
      setIsSubmitting(false);
    },
  });
  
  // Availability mutations
  const createAvailability = api.schedule.createAvailability.useMutation();
  const updateAvailability = api.schedule.updateAvailability.useMutation();
  const deleteAvailability = api.schedule.deleteAvailability.useMutation();
  
  // Populate form with schedule data when editing
  useEffect(() => {
    if (schedule) {
      setFormData({
        name: schedule.name,
        timeZone: schedule.timeZone,
        isDefault: schedule.isDefault,
      });
      
      if (schedule.availability) {
        setAvailability(
          schedule.availability.map((item) => ({
            id: item.id,
            day: item.day,
            startTime: item.startTime,
            endTime: item.endTime,
          }))
        );
      }
    }
  }, [schedule]);
  
  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData({
      ...formData,
      [name]: type === 'checkbox' 
        ? (e.target as HTMLInputElement).checked 
        : value,
    });
  };
  
  // Handle availability change
  const handleAvailabilityChange = (index: number, field: string, value: string | number) => {
    const updatedAvailability = [...availability];
    updatedAvailability[index] = {
      ...updatedAvailability[index],
      [field]: value,
    };
    setAvailability(updatedAvailability);
  };
  
  // Add new availability item
  const addAvailability = () => {
    setAvailability([
      ...availability,
      {
        day: 1, // Monday
        startTime: '09:00',
        endTime: '17:00',
        isNew: true,
      },
    ]);
  };
  
  // Remove availability item
  const removeAvailability = (index: number) => {
    const item = availability[index];
    const updatedAvailability = [...availability];
    updatedAvailability.splice(index, 1);
    setAvailability(updatedAvailability);
    
    // If the item has an ID, add it to the delete list
    if (item.id) {
      setAvailabilityToDelete([...availabilityToDelete, item.id]);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    
    try {
      if (scheduleId) {
        // Update existing schedule
        updateSchedule.mutate({
          id: scheduleId,
          name: formData.name,
          timeZone: formData.timeZone,
          isDefault: formData.isDefault,
        });
      } else {
        // Create new schedule
        createSchedule.mutate({
          name: formData.name,
          timeZone: formData.timeZone,
          isDefault: formData.isDefault,
        });
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };
  
  // Get day name
  const getDayName = (day: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day];
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
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Schedule Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Work Schedule, Meeting Hours, etc."
        />
      </div>
      
      <div>
        <label htmlFor="timeZone" className="block text-sm font-medium text-gray-700 mb-1">
          Time Zone
        </label>
        <select
          id="timeZone"
          name="timeZone"
          value={formData.timeZone}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="UTC">UTC</option>
          <option value="America/New_York">Eastern Time (ET)</option>
          <option value="America/Chicago">Central Time (CT)</option>
          <option value="America/Denver">Mountain Time (MT)</option>
          <option value="America/Los_Angeles">Pacific Time (PT)</option>
          <option value="Europe/London">London</option>
          <option value="Europe/Paris">Paris</option>
          <option value="Asia/Tokyo">Tokyo</option>
          <option value="Australia/Sydney">Sydney</option>
        </select>
      </div>
      
      <div className="flex items-center">
        <input
          type="checkbox"
          id="isDefault"
          name="isDefault"
          checked={formData.isDefault}
          onChange={handleChange}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-700">
          Set as default schedule
        </label>
      </div>
      
      <div className="pt-4 border-t border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Availability</h3>
          <button
            type="button"
            onClick={addAvailability}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
          >
            Add Time Slot
          </button>
        </div>
        
        {availability.length === 0 ? (
          <div className="text-center p-6 bg-gray-50 rounded-md">
            <p className="text-gray-500">No availability set. Add your first time slot.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {availability.map((item, index) => (
              <div key={index} className="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4 p-4 bg-gray-50 rounded-md">
                <div className="w-full md:w-1/4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day
                  </label>
                  <select
                    value={item.day}
                    onChange={(e) => handleAvailabilityChange(index, 'day', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={0}>Sunday</option>
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </div>
                
                <div className="w-full md:w-1/4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={item.startTime}
                    onChange={(e) => handleAvailabilityChange(index, 'startTime', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="w-full md:w-1/4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={item.endTime}
                    onChange={(e) => handleAvailabilityChange(index, 'endTime', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="w-full md:w-1/4 flex items-end justify-end">
                  <button
                    type="button"
                    onClick={() => removeAvailability(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-800 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={() => router.push('/dashboard/schedules')}
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
            : scheduleId
            ? 'Update Schedule'
            : 'Create Schedule'}
        </button>
      </div>
    </form>
  );
}
