'use client'

import React, { use, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { WordType } from '@/src/types/WordTypes'
import {
  ArrowDownAZ,
  House,
  Image,
  ImageOff,
  Languages,
  Shuffle,
  Zap,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  NotionWordAllIdsClient,
  NotionWordGetByIdsClient,
} from '@/src/client/WordClient'

const globalAudio = typeof window !== 'undefined' ? new Audio() : null

export default function WordSwipePage({
  params,
}: {
  params: Promise<{ dataSourceId: string }>
}) {
  const { dataSourceId } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  const [words, setWords] = useState<WordType[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isOrder, setIsOrder] = useState(false)
  const [isShowDefinition, setIsShowDefinition] = useState(false)
  const [isShowImage, setIsShowImage] = useState(true)

  const isPreloadingRef = useRef(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isInternalScrollRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const currentWord = words[currentIndex]
  const [ids, setIds] = useState<string[]>()

  const MAX_CACHE_SIZE = 50
  const audioCacheRef = useRef<Map<string, string>>(new Map())

  // 动画状态锁
  const isWheelAnimatingRef = useRef(false)

  // 检测当前是否为 PC 端
  const [isPc, setIsPc] = useState(false)
  useEffect(() => {
    const checkIsPc = () => {
      setIsPc(window.innerWidth >= 768)
    }
    checkIsPc()
    window.addEventListener('resize', checkIsPc)
    return () => window.removeEventListener('resize', checkIsPc)
  }, [])

  const fetchWordAllIds = useCallback(async () => {
    try {
      setIsLoading(true)
      setIds([])
      setWords([])
      audioCacheRef.current.clear()
      const res = await NotionWordAllIdsClient(dataSourceId)
      if (res.code === 200) {
        const resIds = res.data as string[]
        let ids = resIds
        if (!isOrder) {
          const shuffled = [...resIds]
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }
          ids = shuffled
        }
        setIds(ids)
        if (ids && ids.length > 0) {
          const nextIds = ids.slice(0, 10)
          const res = await NotionWordGetByIdsClient(nextIds)
          if (res.code === 200) {
            setWords(res.data || [])
          }
        }
      }
    } catch (error) {
      console.log('error: ' + error)
    } finally {
      setCurrentIndex(0)
      setIsLoading(false)
    }
  }, [dataSourceId, isOrder])

  useEffect(() => {
    let isMounted = true
    const initWordIds = async () => {
      if (isMounted) {
        void fetchWordAllIds()
      }
    }
    void initWordIds()
    return () => {
      isMounted = false
    }
  }, [fetchWordAllIds])

  const doItAgain = async () => {
    if (scrollContainerRef.current) {
      if (isPc) {
        scrollContainerRef.current.scrollTop = 0
      } else {
        scrollContainerRef.current.scrollLeft = 0
      }
    }
    setCurrentIndex(0)
    await fetchWordAllIds()
  }

  // 预加载逻辑
  useEffect(() => {
    const getWords = async () => {
      if (ids && ids.length > 0) {
        if (words.length > 0 && words.length < ids.length) {
          if (currentIndex >= words.length - 8 && !isPreloadingRef.current) {
            isPreloadingRef.current = true
            try {
              const nextIds = ids.slice(words.length, words.length + 10)
              const res = await NotionWordGetByIdsClient(nextIds)
              if (res.code === 200) {
                const list = (res.data as WordType[]) || []
                if (list.length > 0) {
                  setWords((prev) => [...prev, ...list])
                }
              }
            } finally {
              isPreloadingRef.current = false
            }
          }
        }
      }
    }
    void getWords()
  }, [ids, currentIndex, words.length])

  // 音频流自动预加载
  useEffect(() => {
    if (words.length === 0) return
    const cache = audioCacheRef.current
    const PRELOAD_COUNT = 5
    for (let i = 1; i <= PRELOAD_COUNT; i++) {
      const nextWord = words[currentIndex + i]
      if (
        nextWord?.audio_url &&
        !audioCacheRef.current.has(nextWord.audio_url)
      ) {
        const url = nextWord.audio_url
        audioCacheRef.current.set(url, 'loading')

        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error('Network response was not ok')
            return res.blob()
          })
          .then((blob) => {
            const blobUrl = URL.createObjectURL(blob)
            if (cache.size >= MAX_CACHE_SIZE) {
              const oldestKey = cache.keys().next().value
              if (oldestKey) {
                const oldestUrl = cache.get(oldestKey)
                if (oldestUrl?.startsWith('blob:')) {
                  URL.revokeObjectURL(oldestUrl)
                }
                cache.delete(oldestKey)
              }
            }
            audioCacheRef.current.set(url, blobUrl)
          })
          .catch((err) => {
            console.error(`预加载失败:`, err)
            audioCacheRef.current.delete(url)
          })
      }
    }
  }, [currentIndex, words])

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  const playAudioIsActivated = useRef(false)
  const activateAudioForIOS = useCallback(() => {
    if (playAudioIsActivated.current || !globalAudio) return
    globalAudio.src =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
    globalAudio
      .play()
      .then(() => {
        playAudioIsActivated.current = true
      })
      .catch(() => {})
  }, [])

  const playAudio = useCallback(
    (audio_url: string) => {
      if (!audio_url || !globalAudio) return

      if (
        globalAudio.src === audio_url ||
        globalAudio.src === audioCacheRef.current.get(audio_url)
      ) {
        if (globalAudio.paused) {
          globalAudio.play().catch(() => {})
        }
        return
      }

      activateAudioForIOS()

      const cachedBlobUrl = audioCacheRef.current.get(audio_url)
      if (cachedBlobUrl && cachedBlobUrl !== 'loading') {
        globalAudio.src = cachedBlobUrl
      } else {
        globalAudio.src = audio_url
      }

      globalAudio.load()
      globalAudio.play().catch(() => {})
    },
    [activateAudioForIOS],
  )

  useEffect(() => {
    void playAudio(currentWord?.audio_url)
  }, [currentWord, playAudio])

  // 原生滚动与磁力补正逻辑
  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container || isInternalScrollRef.current) return

    // 🌟 核心改进 1：如果正在进行滚轮切换动画，PC端直接无视原生滚动回调，杜绝数据错位
    if (isPc && isWheelAnimatingRef.current) return

    const { scrollLeft, scrollTop, clientWidth, clientHeight } = container

    if (isPc) {
      if (clientHeight === 0) return
      const newIndex = Math.round(scrollTop / clientHeight)
      if (
        newIndex !== currentIndex &&
        newIndex >= 0 &&
        newIndex < words.length
      ) {
        setCurrentIndex(newIndex)
      }

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

      scrollTimeoutRef.current = setTimeout(() => {
        // 二次防御验证，防止定时器触发时正好碰到滚轮正在操作
        if (isWheelAnimatingRef.current) return

        const targetScrollTop = newIndex * clientHeight
        if (Math.abs(container.scrollTop - targetScrollTop) > 2) {
          isInternalScrollRef.current = true
          container.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth',
          })
          setTimeout(() => {
            isInternalScrollRef.current = false
          }, 300)
        }
      }, 150)
    } else {
      // H5 端：保持原有的横向计算
      if (clientWidth === 0) return
      const newIndex = Math.round(scrollLeft / clientWidth)
      if (
        newIndex !== currentIndex &&
        newIndex >= 0 &&
        newIndex < words.length
      ) {
        setCurrentIndex(newIndex)
      }

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

      scrollTimeoutRef.current = setTimeout(() => {
        const targetScrollLeft = newIndex * clientWidth
        if (Math.abs(container.scrollLeft - targetScrollLeft) > 2) {
          isInternalScrollRef.current = true
          container.scrollTo({
            left: targetScrollLeft,
            behavior: 'smooth',
          })
          setTimeout(() => {
            isInternalScrollRef.current = false
          }, 300)
        }
      }, 150)
    }
  }

  // PC 端鼠标滚轮上下滑动逻辑精准控制
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return

      e.preventDefault() // 彻底拦截浏览器默认的纵向滚动与惯性
      if (isWheelAnimatingRef.current) return

      const { clientHeight } = container
      if (clientHeight === 0) return

      let nextIndex = currentIndex
      if (e.deltaY > 0) {
        nextIndex = Math.min(currentIndex + 1, words.length - 1)
      } else {
        nextIndex = Math.max(currentIndex - 1, 0)
      }

      if (nextIndex !== currentIndex) {
        isWheelAnimatingRef.current = true
        isInternalScrollRef.current = true
        setCurrentIndex(nextIndex)

        container.scrollTo({
          top: nextIndex * clientHeight,
          behavior: 'smooth',
        })

        // 这里的延迟时间延长至 500ms，确保平滑滚动过渡彻底静止、清空所有宏任务后再开锁
        setTimeout(() => {
          isWheelAnimatingRef.current = false
          isInternalScrollRef.current = false
        }, 500)
      }
    }

    if (isPc) {
      container.addEventListener('wheel', handleWheel, { passive: false })
    }

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [currentIndex, words.length, isPc])

  const getFontSizeClass = (wordLength: number) => {
    if (wordLength > 15) return 'text-xl md:text-6xl'
    if (wordLength > 10) return 'text-2xl md:text-6xl'
    if (wordLength > 7) return 'text-3xl md:text-6xl'
    return 'text-4xl md:text-6xl'
  }

  if (isLoading && words.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center ">
        <Spinner color="current" />
      </div>
    )
  }

  return (
    <div className="w-full h-full mx-auto flex flex-col overflow-hidden">
      {/* 🌟 核心改进 2：在样式上，PC 端彻底去掉 snap-y 与 snap-mandatory，防止原生吸附与滚动冲突 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 flex h-full w-full relative no-scrollbar ${
          isPc
            ? 'flex-col overflow-y-auto overflow-x-hidden'
            : 'flex-row overflow-x-auto overflow-y-hidden snap-x snap-mandatory'
        }`}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: isPc ? 'none' : 'x mandatory', // PC 端关闭 CSS 级别的磁吸机制
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          ...({
            '&::webkitScrollbar': { display: 'none' },
          } as React.CSSProperties),
        }}
      >
        {words.map((word, index) => (
          <div
            key={`${word.id}-${index}`}
            className={`w-full h-full shrink-0 px-4 pt-2 pb-3 box-border ${
              isPc ? '' : 'snap-center snap-always'
            }`}
            style={{ contentVisibility: 'auto' }}
          >
            <div
              onClick={() => playAudio(word.audio_url)}
              className="w-full h-full flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl pb-4 overflow-hidden
              shadow-md active:shadow-inner active:scale-[0.98] transition-all duration-75 select-none"
            >
              <div className="w-full flex justify-end items-center pl-3 pr-3 pt-2"></div>
              <div className="flex flex-1 w-full items-center justify-center pl-4 pr-4">
                <div>
                  <div className="text-center pointer-events-none">
                    <p
                      className={`${getFontSizeClass(word.word?.length || 0)} font-bold text-warning tracking-wide break-words max-w-full transition-all duration-200`}
                    >
                      {word.word}
                    </p>

                    {word.phonetic && (
                      <p className="text-sm md:text-lg font-medium text-neutral-400 mt-1.5 font-sans tracking-wide">
                        /{word.phonetic}/
                      </p>
                    )}
                  </div>

                  {isShowImage && word.image_url && (
                    <div className="w-full flex items-center justify-center p-2 mt-2 overflow-hidden shrink bg-gray-50 pointer-events-none">
                      <img
                        src={word.image_url}
                        alt="Mnemonics"
                        decoding="async"
                        loading={
                          Math.abs(index - currentIndex) <= 1 ? 'eager' : 'lazy'
                        }
                        className="object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {word.definition && (
                    <div className="flex justify-center">
                      {word.pos && (
                        <div>
                          <p className="text-sm font-medium text-neutral-400 mt-2 font-sans tracking-wide">
                            {word.pos?.replace(/^[.\s]+|[.\s]+$/g, '')}.
                          </p>
                        </div>
                      )}
                      {isShowDefinition && (
                        <p className="text-sm font-medium text-neutral-600 mt-2 ml-1 max-w-[90%] leading-relaxed ">
                          {word.definition}
                        </p>
                      )}
                    </div>
                  )}
                  {index === words.length - 1 && (
                    <div className="pt-6 pb-2 pl-10 pr-10 w-full">
                      <Button
                        size="lg"
                        fullWidth={true}
                        onClick={(e) => {
                          e.stopPropagation()
                          void doItAgain()
                        }}
                      >
                        <Zap className="text-amber-400 fill-amber-400" />
                        Let&#39;s Do It Again
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 底部固定进度 */}
      <div className="pt-1 pb-1 pl-4 pr-6 flex items-center justify-between shrink-0 border-t border-gray-100  ">
        <div className="flex flex-1 items-center justify-start">
          <Button
            size="lg"
            isIconOnly
            variant="ghost"
            onClick={() => {
              setIsLoading(true)
              router.push('/')
            }}
            isPending={isLoading}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : <House />}
              </>
            )}
          </Button>
          <div className="ml-4 flex items-center justify-center">
            <button
              onClick={() => setIsOrder(!isOrder)}
              className={`p-1 rounded transition-colors focus:outline-none text-blue-600 hover:bg-blue-100`}
              title={isOrder ? 'order' : 'shuffled'}
            >
              {isOrder ? (
                <ArrowDownAZ className="h-4 w-4" />
              ) : (
                <Shuffle className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="ml-4 flex items-center justify-center">
            <button
              onClick={() => setIsShowImage(!isShowImage)}
              className={`p-1 rounded transition-colors focus:outline-none ${
                isShowImage
                  ? 'text-blue-600 hover:bg-blue-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isShowImage ? 'hidden' : 'show'}
            >
              {isShowImage ? (
                <Image className="h-4 w-4" />
              ) : (
                <ImageOff className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="ml-4 flex items-center justify-center">
            <button
              onClick={() => setIsShowDefinition(!isShowDefinition)}
              className={`p-1 rounded transition-colors focus:outline-none ${
                isShowDefinition
                  ? 'text-blue-600 hover:bg-blue-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isShowDefinition ? 'hidden' : 'show'}
            >
              <Languages className="h-4 w-4" />
            </button>
          </div>
        </div>
        <span className="text-xs text-default-400 font-medium">
          {ids && ids.length > 0 ? currentIndex + 1 : 0} / {ids?.length || 0}
        </span>
      </div>
    </div>
  )
}
