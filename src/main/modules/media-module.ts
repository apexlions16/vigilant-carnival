import { ipcMain, protocol, app, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn } from 'child_process'

const SCHEME = 'dublab-media'

let ffmpegPath: string | null = null
try {
  ffmpegPath = require('ffmpeg-static')
} catch {
  ffmpegPath = null
}

function normalizePath(p: string): string {
  let out = p
  if (process.platform === 'win32' && out.startsWith('/')) out = out.slice(1)
  out = out.replace(/\//g, path.sep)
  return path.normalize(out)
}

function sha1(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex')
}

async function ensureTempDir(): Promise<string> {
  const dir = path.join(app.getPath('temp'), 'dublab-cache')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function transcodeToPcmWav(absInput: string): Promise<string> {
  if (!ffmpegPath) throw new Error('ffmpeg-static kurulu değil. "npm i ffmpeg-static" çalıştırın.')

  const st = fs.statSync(absInput)
  const key = sha1(`${absInput}|${st.size}|${st.mtimeMs}`)
  const tempDir = await ensureTempDir()
  const outPath = path.join(tempDir, `${key}.wav`)

  if (fs.existsSync(outPath)) return outPath

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', absInput,
      '-vn',
      // garanti wav/pcm:
      '-acodec', 'pcm_s16le',
      '-f', 'wav',
      outPath,
    ]

    const p = spawn(ffmpegPath as string, args, { windowsHide: true })
    let err = ''

    p.stderr.on('data', (d) => (err += d.toString()))
    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve()
      else reject(new Error(err || `ffmpeg çıkış kodu: ${code}`))
    })
  })

  return outPath
}

// protocol dursun (şimdilik kullanmasak da)
export function registerMediaProtocol(): void {
  protocol.registerFileProtocol(SCHEME, (request, callback) => {
    try {
      const url = new URL(request.url)
      const decoded = decodeURIComponent(url.pathname)
      const filePath = normalizePath(decoded)
      if (!fs.existsSync(filePath)) return callback(-6 as any)
      callback({ path: filePath })
    } catch {
      callback(-2 as any)
    }
  })
}

export function registerMediaHandlers(): void {
  ipcMain.handle('media:open-system', async (_event, filePath: string) => {
    try {
      const abs = path.resolve(filePath)
      const r = await shell.openPath(abs)
      if (r) return { success: false, error: r }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'open-system hatası' }
    }
  })

  /**
   * ✅ GARANTİLİ Playback data:
   * - ffmpeg ile PCM WAV üret
   * - dosyayı oku
   * - Renderer'a base64 olarak gönder
   */
  ipcMain.handle('media:read-playable', async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Geçersiz dosya yolu.' }
      }

      const abs = path.resolve(filePath)
      if (!fs.existsSync(abs)) {
        return { success: false, error: 'Dosya bulunamadı.' }
      }

      const playablePath = await transcodeToPcmWav(abs)
      const buf = await fs.promises.readFile(playablePath)

      // debug signature
      const sigHex = buf.subarray(0, 12).toString('hex')
      const dataB64 = buf.toString('base64')

      return {
        success: true,
        mime: 'audio/wav',
        size: buf.length,
        signature_hex: sigHex,
        data_b64: dataB64,
        playable_path: playablePath,
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'media:read-playable hatası' }
    }
  })
}