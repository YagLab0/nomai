import { proxyChatRequest } from '../proxy';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  return proxyChatRequest(request, `/chats/${id}`);
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return proxyChatRequest(request, `/chats/${id}`);
}

export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  return proxyChatRequest(request, `/chats/${id}`);
}
