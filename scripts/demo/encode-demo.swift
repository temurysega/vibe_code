// Собирает MP4 (H.264, 1080×1920, 30 к/с) из кадров record-demo.py: экран телефона по центру,
// подпись шага сверху, заставка в начале и в конце. Только macOS (AVFoundation, CoreText).
// Запуск: swift scripts/demo/encode-demo.swift <папка-записи> <результат.mp4>
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count == 3 else { print("usage: encode-demo.swift <run-dir> <out.mp4>"); exit(2) }
let runDir = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
struct Frame: Decodable { let file: String; let t: Double }
struct Caption: Decodable { let t: Double; let title: String; let subtitle: String }
struct Timeline: Decodable { let frames: [Frame]; let captions: [Caption] }
let timeline = try JSONDecoder().decode(Timeline.self, from: Data(contentsOf: runDir.appendingPathComponent("timeline.json")))

let W = 1080, H = 1920, fps: Int32 = 30
let introSeconds = 3.5, outroSeconds = 5.0
let t0 = timeline.frames[0].t
let recSeconds = timeline.frames.last!.t - t0 + 0.8
let total = Int((introSeconds + recSeconds + outroSeconds) * Double(fps))

func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
  CGColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}
let navyTop = rgb(0x163676), navyBottom = rgb(0x0B1D45), white = rgb(0xFFFFFF), soft = rgb(0xD5DFF3), muted = rgb(0x9FB2D8), gold = rgb(0xD7B34D)

func font(_ size: CGFloat, bold: Bool = false) -> CTFont {
  CTFontCreateUIFontForLanguage(bold ? .emphasizedSystem : .system, size, nil)!
}
// Текст в прямоугольнике, заданном от верхнего края кадра; возвращает высоту набранного текста.
@discardableResult
func text(_ ctx: CGContext, _ s: String, _ f: CTFont, _ color: CGColor, x: CGFloat, top: CGFloat, width: CGFloat, center: Bool = false) -> CGFloat {
  var align: CTTextAlignment = center ? .center : .left
  let style = withUnsafeBytes(of: &align) { ptr -> CTParagraphStyle in
    var setting = CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: ptr.baseAddress!)
    return CTParagraphStyleCreate(&setting, 1)
  }
  let attributed = NSAttributedString(string: s, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): f,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    NSAttributedString.Key(kCTParagraphStyleAttributeName as String): style])
  let setter = CTFramesetterCreateWithAttributedString(attributed)
  let size = CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRange(location: 0, length: 0), nil, CGSize(width: width, height: 2000), nil)
  let rect = CGRect(x: x, y: CGFloat(H) - top - ceil(size.height), width: width, height: ceil(size.height))
  CTFrameDraw(CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), CGPath(rect: rect, transform: nil), nil), ctx)
  return ceil(size.height)
}
func background(_ ctx: CGContext) {
  let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [navyTop, navyBottom] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: H), end: CGPoint(x: 0, y: 0), options: [])
}
func makeContext() -> CGContext {
  CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
}
let footer = "Концепт для конкурса · данные вымышлены · Chromium, мобильный режим 390×844"

func card(_ lines: [(String, CTFont, CGColor, CGFloat)]) -> CGImage {
  let ctx = makeContext(); background(ctx)
  var top: CGFloat = 640
  for (s, f, c, gap) in lines { top += text(ctx, s, f, c, x: 90, top: top, width: CGFloat(W) - 180, center: true) + gap }
  return ctx.makeImage()!
}
let intro = card([("МГИМО Мания", font(92, bold: true), white, 26),
                  ("концепт личного кабинета студента", font(44), soft, 90),
                  ("Запись в мобильном режиме, экран 390×844: справка от заявки до документа", font(40), white, 70),
                  ("Конкурсный концепт, не официальный сервис МГИМО. Все люди и данные вымышлены.", font(32), muted, 0)])
let outro = card([("Попробуйте сами", font(70, bold: true), white, 34),
                  ("ai.neblanki.tech", font(56, bold: true), gold, 60),
                  ("Тестовые аккаунты: a.morozova, t.aliev, k.lebedeva, dekanat.mo · пароль mgimo2026", font(36), white, 50),
                  ("Код и описание процесса: github.com/temurysega/vibe_code", font(34), soft, 0)])

var imageCache: [Int: CGImage] = [:]
func screen(_ index: Int) -> CGImage {
  if let image = imageCache[index] { return image }
  let url = runDir.appendingPathComponent(timeline.frames[index].file)
  let image = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(url as CFURL, nil)!, 0, nil)!
  imageCache = [index: image]
  return image
}
func compose(frame index: Int, caption: Caption?) -> CGImage {
  let ctx = makeContext(); background(ctx)
  if let c = caption {
    let h = text(ctx, c.title, font(56, bold: true), white, x: 70, top: 64, width: CGFloat(W) - 140)
    text(ctx, c.subtitle, font(36), soft, x: 70, top: 64 + h + 14, width: CGFloat(W) - 140)
  }
  let image = screen(index)
  let screenH: CGFloat = 1500, screenW = screenH * CGFloat(image.width) / CGFloat(image.height)
  let rect = CGRect(x: (CGFloat(W) - screenW) / 2, y: 92, width: screenW, height: screenH)
  let shape = CGPath(roundedRect: rect, cornerWidth: 44, cornerHeight: 44, transform: nil)
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 46, color: rgb(0x000000, 0.45))
  ctx.addPath(shape); ctx.setFillColor(rgb(0xFFFFFF)); ctx.fillPath()
  ctx.restoreGState()
  ctx.saveGState(); ctx.addPath(shape); ctx.clip(); ctx.interpolationQuality = .high; ctx.draw(image, in: rect); ctx.restoreGState()
  ctx.addPath(shape); ctx.setStrokeColor(rgb(0xFFFFFF, 0.22)); ctx.setLineWidth(5); ctx.strokePath()
  text(ctx, footer, font(24), muted, x: 60, top: CGFloat(H) - 60, width: CGFloat(W) - 120, center: true)
  return ctx.makeImage()!
}

try? FileManager.default.removeItem(at: outURL)
let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_700_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                                    AVVideoMaxKeyFrameIntervalKey: 90, AVVideoExpectedSourceFrameRateKey: fps]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input)
guard writer.startWriting() else { print("writer: \(String(describing: writer.error))"); exit(1) }
writer.startSession(atSourceTime: .zero)

let frameTimes = timeline.frames.map { $0.t - t0 }
let captionTimes = timeline.captions.map { $0.t - t0 }
var frameIndex = 0, captionIndex = -1, composedKey = "", composed: CGImage = intro
for n in 0..<total {
  let t = Double(n) / Double(fps)
  if t < introSeconds {
    composed = intro
  } else if t < introSeconds + recSeconds {
    let r = t - introSeconds
    while frameIndex + 1 < frameTimes.count && frameTimes[frameIndex + 1] <= r { frameIndex += 1 }
    while captionIndex + 1 < captionTimes.count && captionTimes[captionIndex + 1] <= r { captionIndex += 1 }
    let key = "\(frameIndex):\(captionIndex)"
    if key != composedKey {
      composed = compose(frame: frameIndex, caption: timeline.captions[max(0, captionIndex)])
      composedKey = key
    }
  } else {
    composed = outro
  }
  while !input.isReadyForMoreMediaData { usleep(2000) }
  var buffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
  CVPixelBufferLockBaseAddress(buffer!, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer!), width: W, height: H, bitsPerComponent: 8,
                      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer!), space: CGColorSpaceCreateDeviceRGB(),
                      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(composed, in: CGRect(x: 0, y: 0, width: W, height: H))
  CVPixelBufferUnlockBaseAddress(buffer!, [])
  adaptor.append(buffer!, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "ok: \(outURL.path) · \(String(format: "%.1f", Double(total) / Double(fps))) s" : "failed: \(String(describing: writer.error))")
