import { proxyChatRequest } from './proxy';

export async function GET(request: Request) {
  return proxyChatRequest(request, '/chats');
}

export async function POST(request: Request) {
  return proxyChatRequest(request, '/chats');
}
