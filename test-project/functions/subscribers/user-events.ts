import type { events } from '@tsc-run/core';

export async function listen(event: events.Event) {
  console.log('User event subscriber received:', event);

  if (event.type === 'user.created') {
    console.log('Processing user created event:', event.data);
    // Handle user creation logic
  } else if (event.type === 'user.updated') {
    console.log('Processing user updated event:', event.data);
    // Handle user update logic
  }
}
