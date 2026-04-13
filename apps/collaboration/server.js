import { Server } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { Webhook, Events } from "@hocuspocus/extension-webhook";
import "dotenv/config";

const server = Server.configure({
  port: process.env.COLLABORATION_PORT || 8081,
  
  async onAuthenticate({ token, requestParameters }) {
    // 1. 단순 인증 (향후 JWT 검증 로직 추가 가능)
    if (!token && !requestParameters.get("token")) {
      throw new Error("Unauthorized");
    }
    
    // 2. 권한 정보 (context로 전달)
    return {
      user: {
        id: requestParameters.get("userId"),
        name: requestParameters.get("userName") || "Collaborator",
        color: requestParameters.get("userColor") || "#3b82f6"
      }
    };
  },

  extensions: [
    new Logger(),
    // 3. 백엔드(Go) 웹훅 연동: 업데이트 발생 시 Go 서버에 알림
    new Webhook({
      url: `${process.env.BACKEND_URL || "http://localhost:8080"}/api/internal/collaboration/webhook`,
      headers: process.env.COLLABORATION_WEBHOOK_SECRET
        ? { "X-Webhook-Secret": process.env.COLLABORATION_WEBHOOK_SECRET }
        : {},
      transformer: (data) => {
        // NOTE: Proper markdown extraction from the Yjs document requires
        // @hocuspocus/transformer + TipTap extensions server-side, which are
        // not yet installed. For now, content is intentionally omitted — the
        // Go handler skips the UPDATE when content is empty, so no data loss
        // occurs. Client-side autosave (10s debounce) handles DB persistence.
        return {
          documentName: data.documentName,
          userId: data.context?.user?.id ?? "",
        };
      },
      events: [
        Events.onUpdate,
      ],
    }),
  ],
});

server.listen();
console.log(`Hocuspocus collaboration server is running on port ${server.configuration.port}`);
