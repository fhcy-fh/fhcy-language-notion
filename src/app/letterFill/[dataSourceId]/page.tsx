'use client'

import React, { use, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { useRouter } from 'next/navigation'
import {
  NotionWordAllIdsClient,
  NotionWordGetByIdClient,
} from '@/src/client/WordClient'
import { InitWordType, WordType } from '@/src/types/WordTypes'
import {
  House,
  Image,
  ImageOff,
  Languages,
  RotateCcw,
  Trophy,
} from 'lucide-react'

const globalAudio = typeof window !== 'undefined' ? new Audio() : null

// 帮助函数：从 A-Z 生成干扰字母
const generateOptions = (correctLetter: string): string[] => {
  const isUpperCase = correctLetter === correctLetter.toUpperCase()
  const alphabet = isUpperCase
    ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    : 'abcdefghijklmnopqrstuvwxyz'

  const pool = alphabet.split('').filter((l) => l !== correctLetter)
  const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3)
  return [...distractors, correctLetter].sort(() => 0.5 - Math.random())
}

export default function LetterFillPage({
  params,
}: {
  params: Promise<{ dataSourceId: string }>
}) {
  const { dataSourceId } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  const [isShowImage, setIsShowImage] = useState(true)
  const [isShowDefinition, setIsShowDefinition] = useState(false)

  const [ids, setIds] = useState<string[]>()
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [currentWord, setCurrentWord] = useState<WordType>(InitWordType)
  const [nextWord, setNextWord] = useState<WordType>()

  const [displayWord, setDisplayWord] = useState<string>('')
  const [correctAnswer, setCorrectAnswer] = useState<string>('')
  const [options, setOptions] = useState<string[]>([])
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)

  // 完成提示弹窗状态
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(false)

  const MAX_CACHE_SIZE = 10
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  // 图片预加载缓存容器
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  // 获取并打乱单词 ID
  const fetchWordAllIds = useCallback(async () => {
    try {
      setIsLoading(true)
      setIsCompletedModalOpen(false)
      setIds([])
      setCurrentIndex(0)
      const res = await NotionWordAllIdsClient(dataSourceId)
      if (res.code === 200) {
        const resIds = res.data as string[]
        const shuffled = [...resIds]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        setIds(shuffled)
      }
    } catch (error) {
      console.log('error: ' + error)
    } finally {
      setIsLoading(false)
    }
  }, [dataSourceId])

  useEffect(() => {
    audioCacheRef.current.clear()
    imageCacheRef.current.clear()

    const loadData = async () => {
      // 异步等待一小步，避免在 Effect 调用的第一帧进行同步 setState 造成级联渲染
      await Promise.resolve()
      await fetchWordAllIds()
    }
    void loadData()
  }, [fetchWordAllIds])

  useEffect(() => {
    const getWords = async () => {
      if (ids && ids.length > 0) {
        if (currentIndex < ids.length) {
          const currentId = ids[currentIndex]
          const res = await NotionWordGetByIdClient(currentId)
          if (res.code === 200 && res.data) {
            setCurrentWord(res.data)
            setSelectedOption(null)
            setIsCorrect(null)

            const wordStr = res.data.word
            const letterIndices: number[] = []
            for (let i = 0; i < wordStr.length; i++) {
              if (/[a-zA-Z]/.test(wordStr[i])) {
                letterIndices.push(i)
              }
            }
            if (letterIndices.length > 0) {
              const randomIndex =
                letterIndices[Math.floor(Math.random() * letterIndices.length)]
              const targetLetter = wordStr[randomIndex]

              const newDisplay =
                wordStr.substring(0, randomIndex) +
                '_' +
                wordStr.substring(randomIndex + 1)

              setDisplayWord(newDisplay)
              setCorrectAnswer(targetLetter)
              setOptions(generateOptions(targetLetter))
            } else {
              setDisplayWord(wordStr)
              setCorrectAnswer('')
              setOptions([])
            }
          }
        }
        if (currentIndex + 1 < ids.length) {
          const nextId = ids[currentIndex + 1]
          const res = await NotionWordGetByIdClient(nextId)
          if (res.code === 200) {
            setNextWord(res.data)
          }
        }
      }
    }
    void getWords()
  }, [currentIndex, ids])

  // 音频预加载逻辑
  useEffect(() => {
    const cache = audioCacheRef.current
    if (nextWord?.audio_url && !audioCacheRef.current.has(nextWord.audio_url)) {
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
  }, [nextWord])

  // 图片预加载逻辑
  useEffect(() => {
    const preloadImage = (url?: string) => {
      if (!url || imageCacheRef.current.has(url)) return

      const img = new window.Image()
      img.src = url
      imageCacheRef.current.set(url, img)

      // 超过缓存容量时清理最旧的记录
      if (imageCacheRef.current.size > MAX_CACHE_SIZE) {
        const oldestKey = imageCacheRef.current.keys().next().value
        if (oldestKey) {
          imageCacheRef.current.delete(oldestKey)
        }
      }
    }

    // 预加载下一个单词和当前单词的图片
    if (nextWord?.image_url) {
      preloadImage(nextWord.image_url)
    }
    if (currentWord?.image_url) {
      preloadImage(currentWord.image_url)
    }
  }, [nextWord, currentWord])

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

  const handleSelectOption = (letter: string) => {
    if (selectedOption !== null) return

    setSelectedOption(letter)
    const isAnsCorrect = letter === correctAnswer
    setIsCorrect(isAnsCorrect)

    if (currentWord?.audio_url) {
      playAudio(currentWord.audio_url)
    }

    setTimeout(() => {
      if (ids && currentIndex < ids.length - 1) {
        setCurrentIndex((prev) => prev + 1)
      } else {
        // 完成所有单词，打开提示框
        setIsCompletedModalOpen(true)
      }
    }, 1500)
  }

  // 重新开始游戏
  const handleRestart = () => {
    void fetchWordAllIds()
  }

  const getFontSizeClass = (wordLength: number) => {
    if (wordLength > 15) return 'text-xl'
    if (wordLength > 10) return 'text-2xl'
    if (wordLength > 7) return 'text-3xl'
    return 'text-4xl'
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center ">
        <Spinner color="current" />
      </div>
    )
  }

  return (
    <div className="w-full h-full relative mx-auto flex flex-col overflow-hidden">
      <div className="w-full flex flex-1 flex-col shrink-0 snap-center snap-always px-4 pt-2 pb-3 box-border">
        <div
          className="w-full flex flex-1 flex-col shrink-0 snap-center snap-always px-4 pt-2 pb-3 bg-gray-50 border shadow-md duration-75 select-none  border-gray-100  box-border min-h-0 overflow-y-auto rounded-2xl overflow-hidden"
          onClick={() => playAudio(currentWord.audio_url)}
        >
          <div className="flex-1 flex flex-col items-center justify-center pb-4">
            {/* 3. 辅助记忆图 */}
            {isShowImage && (
              <>
                {currentWord.image_url && (
                  <div className="w-full flex items-center justify-center pl-10 pr-10 mt-2 mb-4 overflow-hidden shrink pointer-events-none">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentWord.image_url}
                      alt="Mnemonics"
                      decoding="async"
                      loading="eager"
                      className="object-cover rounded-lg"
                    />
                  </div>
                )}
              </>
            )}

            {isShowDefinition && currentWord?.definition && (
              <div className="h-6 mt-4 mb-4 flex items-center justify-center text-center px-4">
                {currentWord.pos && (
                  <div>
                    <p className="text-sm font-medium text-neutral-400 mt-2 font-sans tracking-wide">
                      {currentWord.pos?.replace(/^[.\s]+|[.\s]+$/g, '')}.
                    </p>
                  </div>
                )}
                {isShowDefinition && (
                  <p className="text-sm font-medium text-neutral-600 mt-2 ml-1 max-w-[90%] leading-relaxed ">
                    {currentWord.definition}
                  </p>
                )}
              </div>
            )}

            <div
              className={`${getFontSizeClass(displayWord?.length || 0)} text-warning tracking-wide break-words max-w-full duration-200`}
            >
              {selectedOption ? (
                <span>
                  {displayWord.split('_')[0]}
                  <span
                    className={
                      isCorrect ? 'text-emerald-500 ' : 'text-rose-500 '
                    }
                  >
                    {correctAnswer}
                  </span>
                  {displayWord.split('_')[1]}
                </span>
              ) : (
                <span>
                  {displayWord.split('_')[0]}
                  <span className=" text-zinc-500  border-zinc-500 mx-0.5 px-0.5 inline-block bottom-[-2px] relative animate-pulse">
                    _
                  </span>
                  {displayWord.split('_')[1]}
                </span>
              )}
            </div>
          </div>

          <div className="w-full max-w-2xl mx-auto p-4">
            <div className="grid grid-cols-2 gap-3.5 w-full">
              {options.map((option, idx) => {
                const isOptionCorrect = option === correctAnswer

                let btnClasses =
                  'h-14 text-lg md:h-16 md:text-xl font-bold font-mono transition-all duration-200 rounded-2xl bg-white border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:bg-zinc-50 active:scale-[0.98]'

                if (selectedOption !== null) {
                  if (isOptionCorrect) {
                    btnClasses =
                      'h-14 text-lg md:h-16 md:text-xl font-bold font-mono transition-all rounded-2xl bg-emerald-50 text-emerald-600 border-0 pointer-events-none shadow-none duration-300'
                  } else {
                    btnClasses =
                      'h-14 text-lg md:h-16 md:text-xl font-bold font-mono transition-all rounded-2xl opacity-0 pointer-events-none shadow-none duration-300'
                  }
                }

                return (
                  <button
                    key={idx}
                    disabled={selectedOption !== null}
                    onClick={() => handleSelectOption(option)}
                    className={btnClasses}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 底部固定进度 */}
      <div className="h-14 pt-1 pb-1 pl-4 pr-6 flex items-center justify-start shrink-0 border-t border-gray-100  ">
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
            <>{isPending ? <Spinner color="current" size="sm" /> : <House />}</>
          )}
        </Button>
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
              <ImageOff className="h-4 w-4 text-gray-400" />
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

      {/* 完成提示自定义弹窗 */}
      {isCompletedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full text-center shadow-xl flex flex-col items-center">
            <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8" />
            </div>

            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              Great Job! 🎉
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              Congratulations! You&apos;ve completed all the words!
            </p>

            <div className="flex flex-col gap-3 w-full">
              <Button
                size="lg"
                className="w-full font-semibold shadow-md flex items-center justify-center gap-2"
                onClick={handleRestart}
              >
                <RotateCcw className="w-5 h-5" />
                Let&apos;s Do It Again
              </Button>
              <Button
                size="lg"
                className="w-full text-gray-500 font-medium"
                onClick={() => {
                  setIsLoading(true)
                  router.push('/')
                }}
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
