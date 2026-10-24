'use client'

import { useEffect, useRef } from 'react'

type Star = {
  x: number
  y: number
  radius: number
  alpha: number
  depth: number
  speed: number
  phase: number
}

function makeStars(width: number, height: number): Star[] {
  const count = Math.round((width * height) / 14000)
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: 0.3 + Math.random() * 0.7,
    alpha: 0.12 + Math.random() * 0.28,
    depth: 0.25 + Math.random() * 0.75,
    speed: 0.00025 + Math.random() * 0.0011,
    phase: Math.random() * Math.PI * 2,
  }))
}

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    let stars: Star[] = []

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(width * ratio))
      canvas.height = Math.max(1, Math.floor(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      stars = makeStars(width, height)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let frame = 0
    const draw = (time: number) => {
      const { width, height } = canvas.getBoundingClientRect()
      context.clearRect(0, 0, width, height)
      for (const star of stars) {
        const wave = Math.sin(time * star.speed + star.phase)
        const flicker = reduceMotion ? 1 : 1 - star.depth * (0.5 - 0.5 * wave)
        context.fillStyle = `rgba(226, 232, 240, ${star.alpha * flicker})`
        context.beginPath()
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        context.fill()
      }
      frame = window.requestAnimationFrame(draw)
    }

    frame = window.requestAnimationFrame(draw)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className='pointer-events-none absolute inset-0 h-full w-full'
    />
  )
}
