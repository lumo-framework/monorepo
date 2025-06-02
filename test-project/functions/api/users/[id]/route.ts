import { response, http } from '@tsc-run/core';

export async function GET(req: http.Request): Promise<http.Response> {
  const { id } = req.params;

  console.log('Processing GET request for user ID:', id);

  return response(200).json({
    message: `Hello from user ${id}`,
    userId: id,
    path: req.path,
    params: req.params,
  });
}

export async function DELETE(req: http.Request): Promise<http.Response> {
  const { id } = req.params;

  console.log('Processing DELETE request for user ID:', id);

  return response(200).json({
    message: `User ${id} deleted successfully`,
    userId: id,
    params: req.params,
  });
}
