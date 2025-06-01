import { response, http } from '@tsc-run/core';

export async function GET(req: http.Request): Promise<http.Response> {
  const { userId, postId } = req.params;

  console.log('Processing GET request for user post:', { userId, postId });

  return response(200).json({
    message: `Post ${postId} from user ${userId}`,
    userId,
    postId,
    path: req.path,
    params: req.params,
    query: req.query,
  });
}

export async function PATCH(req: http.Request): Promise<http.Response> {
  const { userId, postId } = req.params;
  const body = req.json();

  console.log('Processing PATCH request for user post:', {
    userId,
    postId,
    body,
  });

  return response(200).json({
    message: `Post ${postId} from user ${userId} updated`,
    userId,
    postId,
    updatedData: body,
    params: req.params,
  });
}
