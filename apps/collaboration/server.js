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
        return {
          documentName: data.documentName,
          content: data.context.content, // 실제 본문 데이터
          userId: data.context.user.id
        };
      },
      events: [
        Events.onUpdate, // 문서가 수정될 때마다 호출
      ],
    }),
  ],
});

server.listen();
console.log(`Hocuspocus collaboration server is running on port ${server.configuration.port}`);
