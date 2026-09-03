import { SessionDetailView } from "@/components/session-detail-view"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  // key 强制切换会话时重建详情状态，避免上一会话事件/标题串入
  return <SessionDetailView key={id} sessionId={id} />
}
