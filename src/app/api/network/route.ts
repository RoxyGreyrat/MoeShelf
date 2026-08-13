// /api/network —— 本机局域网 IP（S1 依据编译产物模块 8065 重建）。
// 注意：编译产物中二维码由前端 qrcode-generator 生成，本路由仅返回 IP 列表与端口。
import { NextRequest, NextResponse } from 'next/server'
import os from 'os'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const ips: string[] = []
  try {
    const interfaces = os.networkInterfaces()
    for (const list of Object.values(interfaces)) {
      for (const item of list ?? []) {
        if (item.family !== 'IPv4' || item.internal) continue
        ips.push(item.address)
      }
    }
  } catch {
    // 获取失败时返回空列表
  }
  const port = req.nextUrl.port || '3000'
  return NextResponse.json({ ok: true, ips, port })
}
