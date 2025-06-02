import { response, http, events } from '@tsc-run/core';

export async function GET(req: http.Request): Promise<http.Response> {
  console.log('Processing GET request for users');
  return response(200).json({ message: 'Hello from users route' });
}

export async function POST(req: http.Request): Promise<http.Response> {
  console.log('Processing POST request for users');
  console.warn('This is a warning message');

  // Simulate an error scenario
  if (req.body?.error) {
    console.error('Simulated error occurred:', req.body.error);
    throw new Error('Simulated error: ' + req.body.error);
  }

  // Emit user created event
  const userData = { userId: '123', email: 'test@example.com' };
  await events.emit('user.created', userData);

  return response(201).json({
    message: 'User created successfully',
    user: userData,
  });
}
