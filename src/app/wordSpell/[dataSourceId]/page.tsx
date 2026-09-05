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
  Image as ImageIcon,
  ImageOff,
  Keyboard,
  KeyboardOff,
  Languages,
} from 'lucide-react'

const globalAudio = typeof window !== 'undefined' ? new Audio() : null

// 辅助函数：判断一个字符是否是纯英文字母
const isLetter = (char: string) => /^[a-zA-Z]$/.test(char)

export default function LetterFillPage({
  params,
}: {
  params: Promise<{ dataSourceId: string }>
}) {
  const { dataSourceId } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  const [isShowWord, setIsShowWord] = useState(true)
  const [isShowImage, setIsShowImage] = useState(true)
  const [isShowDefinition, setIsShowDefinition] = useState(false)

  const [ids, setIds] = useState<string[]>()
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [currentWord, setCurrentWord] = useState<WordType>(InitWordType)
  const [nextWord, setNextWord] = useState<WordType>()

  // --- 状态列表 ---
  const [inputValues, setInputValues] = useState<string[]>([]) // 存储每个格子的值（含特殊符号）
  const [activeWordStr, setActiveWordStr] = useState<string>('') // 原始目标单词字符串
  const [isWordComplete, setIsWordComplete] = useState<boolean>(false)

  const inputRefs = useRef<HTMLInputElement[]>([])

  const MAX_CACHE_SIZE = 10
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  // 图片预加载缓存容器
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  // 自动聚焦到当前最新需要填写的输入框
  const focusActiveInput = useCallback(() => {
    if (isWordComplete) return

    // 【优化】：寻找格子时，对比也忽略大小写
    const nextEmptyIndex = activeWordStr.split('').findIndex((char, idx) => {
      return (
        isLetter(char) && inputValues[idx]?.toLowerCase() !== char.toLowerCase()
      )
    })

    const targetIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : 0

    if (inputRefs.current[targetIndex]) {
      inputRefs.current[targetIndex].focus()
    }
  }, [inputValues, activeWordStr, isWordComplete])

  // 获取所有单词 ID
  useEffect(() => {
    audioCacheRef.current.clear()
    imageCacheRef.current.clear()
    const fetchWordAllIds = async () => {
      try {
        setIsLoading(true)
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
    }
    void fetchWordAllIds()
  }, [dataSourceId])

  // 加载当前单词与预加载下一个单词
  useEffect(() => {
    const getWords = async () => {
      if (ids && ids.length > 0) {
        if (currentIndex < ids.length) {
          const currentId = ids[currentIndex]
          const res = await NotionWordGetByIdClient(currentId)
          if (res.code === 200 && res.data) {
            const wordStr = res.data.word || ''
            setCurrentWord(res.data)
            setActiveWordStr(wordStr)
            setIsWordComplete(false)

            // 初始化输入框
            const initialInputs = wordStr.split('').map((char: string) => {
              return isLetter(char) ? '' : char
            })
            setInputValues(initialInputs)

            inputRefs.current = []

            // 自动聚焦到第一个【需要输入字母】的输入框
            setTimeout(() => {
              const firstLetterIdx = wordStr
                .split('')
                .findIndex((c: string) => isLetter(c))
              const targetIdx = firstLetterIdx !== -1 ? firstLetterIdx : 0
              if (inputRefs.current[targetIdx]) {
                inputRefs.current[targetIdx].focus()
              }
            }, 60)
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

  useEffect(() => {
    void playAudio(currentWord.audio_url)
  }, [currentWord, playAudio])

  // 处理输入框变更核心逻辑
  const handleInputChange = (index: number, val: string) => {
    if (isWordComplete) return

    const lastChar = val.slice(-1)
    const targetChar = activeWordStr[index]

    // 【核心修改点 1】：统一转为小写进行不区分大小写匹配
    if (lastChar.toLowerCase() === targetChar.toLowerCase()) {
      const newInputValues = [...inputValues]
      // 【体验优化】：格子里保留原始目标字符的大小写样式，或者也可以改为保留用户输入的 lastChar
      newInputValues[index] = targetChar
      setInputValues(newInputValues)

      // 寻找下一个真正需要输入的字母索引
      let nextLetterIdx = -1
      for (let i = index + 1; i < activeWordStr.length; i++) {
        if (isLetter(activeWordStr[i])) {
          nextLetterIdx = i
          break
        }
      }

      // 如果后面没有需要输入的字母了，代表整个单词拼写完成
      if (nextLetterIdx === -1) {
        setIsWordComplete(true)
        if (currentWord?.audio_url) {
          playAudio(currentWord.audio_url)
        }
        setTimeout(() => {
          if (ids && currentIndex < ids.length - 1) {
            setCurrentIndex((prev) => prev + 1)
          }
        }, 1200)
      } else {
        // 自动聚焦到下一个有字母的输入框
        setTimeout(() => {
          inputRefs.current[nextLetterIdx]?.focus()
        }, 10)
      }
    }
  }

  // 处理退格键(Backspace)物理回退
  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !inputValues[index] && index > 0) {
      // 按回退键时，向左找到上一个真正是字母的格子
      let prevLetterIdx = -1
      for (let i = index - 1; i >= 0; i--) {
        if (isLetter(activeWordStr[i])) {
          prevLetterIdx = i
          break
        }
      }

      if (prevLetterIdx !== -1) {
        const newInputValues = [...inputValues]
        newInputValues[prevLetterIdx] = '' // 清空上一个字母格的内容
        setInputValues(newInputValues)
        setTimeout(() => {
          inputRefs.current[prevLetterIdx]?.focus()
        }, 10)
      }
    }
  }

  const getFontSizeClass = (wordLength: number) => {
    if (wordLength > 15) return 'text-xl md:text-6xl'
    if (wordLength > 10) return 'text-2xl md:text-6xl'
    if (wordLength > 7) return 'text-3xl md:text-6xl'
    return 'text-4xl md:text-6xl'
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center ">
        <Spinner color="current" />
      </div>
    )
  }

  return (
    <div className="w-full h-full mx-auto flex flex-col overflow-hidden">
      <div className="w-full flex flex-1 flex-col shrink-0 snap-center snap-always px-4 pt-2 pb-3 box-border">
        <div
          className="w-full flex flex-1 flex-col shrink-0 snap-center snap-always px-4 pt-2 pb-3 bg-gray-50 border shadow-md duration-75 select-none border-gray-100 box-border min-h-0 overflow-y-auto rounded-2xl overflow-hidden"
          onClick={() => {
            playAudio(currentWord.audio_url)
            focusActiveInput()
          }}
        >
          <div className="flex-1 flex flex-col items-center justify-center pb-4 w-full">
            {isShowWord && (
              <div className="text-center pointer-events-none mb-8">
                <p
                  className={`${getFontSizeClass(currentWord.word?.length || 0)} font-bold text-warning tracking-wide break-words max-w-full transition-all duration-200`}
                >
                  {currentWord.word}
                </p>
              </div>
            )}

            {isShowImage && currentWord.image_url && (
              <div className="w-full flex items-center justify-center pl-10 pr-10 mt-2 mb-8 overflow-hidden shrink pointer-events-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentWord.image_url}
                  alt="Mnemonics"
                  decoding="async"
                  loading="eager"
                  className="max-h-80 object-cover rounded-lg"
                />
              </div>
            )}

            <div className="text-center pointer-events-none">
              {currentWord.phonetic && (
                <p className="text-sm md:text-lg font-medium text-neutral-400 mt-1.5 font-sans tracking-wide">
                  /{currentWord.phonetic}/
                </p>
              )}
            </div>

            {isShowDefinition && currentWord?.definition && (
              <div className="h-6 mt-4 mb-6 flex items-center justify-center text-center px-4">
                {currentWord.pos && (
                  <div>
                    <p className="text-sm font-medium text-neutral-400 mt-2 font-sans tracking-wide">
                      {currentWord.pos?.replace(/^[.\s]+|[.\s]+$/g, '')}.
                    </p>
                  </div>
                )}
                <p className="text-sm font-medium text-neutral-600 mt-2 ml-1 max-w-[90%] leading-relaxed ">
                  {currentWord.definition}
                </p>
              </div>
            )}

            <div className="w-full mx-auto pt-6 pb-6 pl-64 pr-64 flex flex-wrap gap-3 justify-center items-center select-none">
              {activeWordStr.split('').map((char, idx) => {
                const charIsLetter = isLetter(char)

                if (!charIsLetter) {
                  return (
                    <div
                      key={idx}
                      className="w-6 h-14 md:w-8 md:h-18 flex items-center justify-center text-2xl md:text-3xl font-extrabold text-slate-400 select-none"
                    >
                      {char}
                    </div>
                  )
                }

                // 【核心修改点 2】：判断激活状态时，对比也忽略大小写
                const isCurrentActive = activeWordStr
                  .split('')
                  .slice(0, idx)
                  .every(
                    (c, i) =>
                      !isLetter(c) ||
                      inputValues[i]?.toLowerCase() === c.toLowerCase(),
                  )

                const isFilled = inputValues[idx] !== ''

                return (
                  <input
                    key={idx}
                    ref={(el) => {
                      if (el) inputRefs.current[idx] = el
                    }}
                    type="text"
                    maxLength={1}
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    disabled={!isCurrentActive || isWordComplete}
                    value={inputValues[idx] || ''}
                    onChange={(e) => handleInputChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className={`
                          w-11 h-14 md:w-14 md:h-18 text-2xl md:text-3xl font-extrabold font-mono text-center 
                          rounded-2xl border transition-all duration-300 ease-out transform outline-none caret-transparent
                          
                          ${
                            isWordComplete || isFilled
                              ? 'bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 border-emerald-300 shadow-lg shadow-emerald-100/50 scale-100'
                              : isCurrentActive
                                ? 'bg-white text-slate-800 border-blue-300 border-2 ring-4 ring-indigo-50 animate-pulse shadow-sm shadow-indigo-100'
                                : 'bg-slate-50 text-slate-300 border-slate-300/60 cursor-not-allowed opacity-60 font-medium'
                          }
                          ${isCurrentActive && !isWordComplete ? 'hover:border-blue-600 hover:scale-105' : ''}
                        `}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 底部固定进度 */}
      <div className="h-14 pt-1 pb-1 pl-4 pr-6 flex items-center justify-start shrink-0 border-t border-gray-100 ">
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
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <House />
              )}{' '}
            </>
          )}
        </Button>
        <div className="ml-4 flex items-center justify-center">
          <button
            onClick={() => setIsShowWord(!isShowWord)}
            className={`p-1 rounded transition-colors focus:outline-none ${
              isShowWord
                ? 'text-blue-600 hover:bg-blue-100'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title={isShowWord ? 'hidden' : 'show'}
          >
            {isShowWord ? (
              <Keyboard className="h-4 w-4" />
            ) : (
              <KeyboardOff className="h-4 w-4" />
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
              <ImageIcon className="h-4 w-4" />
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
    </div>
  )
}
