'use client'

import { Button, Spinner } from '@heroui/react'
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import {
  BetweenVerticalStart,
  RedoDot,
  Spline,
  TextCursorInput,
} from 'lucide-react'
import { NotionBookClient } from '@/src/client/BookClient'
import { BookType } from '@/src/types/BookTypes'
import { NotionBaseClient } from '@/src/client/BaseClient'
import { BaseInfoType } from '@/src/types/CommonTypes'

export default function HomePage() {
  const router = useRouter()

  const [isPendingWordSwipe, setIsPendingWordSwipe] = useState(false)
  const [isPendingWordMatch, setIsPendingWordMatch] = useState(false)
  const [isPendingLetterFill, setIsPendingLetterFill] = useState(false)
  const [isPendingWordSpell, setIsPendingWordSpell] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [pendingBookId, setPendingBookId] = useState<string | null>(null)
  const [books, setBooks] = useState<BookType[]>()
  const [baseInfo, setBaseInfo] = useState<BaseInfoType>()
  const [currentRouter, setCurrentRouter] = useState<string>()

  // 初始化数据
  useEffect(() => {
    const fetchBooks = async () => {
      const res = await NotionBookClient()
      if (res.code === 200) {
        const books = res.data as BookType[]
        setBooks(books)
      }
    }
    const fetchBaseInfo = async () => {
      const baseInfoRes = await NotionBaseClient()
      if (baseInfoRes.code === 200) {
        const baseInfo = baseInfoRes.data as BaseInfoType
        setBaseInfo(baseInfo)
      }
    }
    const init = async () => {
      try {
        setIsLoading(true)
        void fetchBooks()
        await fetchBaseInfo()
      } finally {
        setIsLoading(false)
      }
    }
    void init()
  }, [])

  const handle = (currentRouter: string) => {
    if (books?.length === 1) {
      router.push(currentRouter + '/' + books[0].data_source_id)
    } else {
      setCurrentRouter(currentRouter)
      setIsOpen(true)
    }
  }

  // 关闭通用函数
  const handleClose = () => {
    setIsOpen(false)
    setIsPendingWordSwipe(false)
    setIsPendingWordMatch(false)
    setIsPendingLetterFill(false)
    setIsPendingWordSpell(false)
  }

  // --- 手势交互状态与引用（仅 H5 抽屉有效） ---
  const bodyRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const [currentTranslateY, setCurrentTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (bodyRef.current && bodyRef.current.scrollTop > 0) return
    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const deltaY = currentY - touchStartY.current
    if (deltaY > 0) {
      setCurrentTranslateY(deltaY)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (currentTranslateY > 80) {
      handleClose()
    }
    setCurrentTranslateY(0)
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center ">
        <Spinner color="current" />
      </div>
    )
  }

  // 抽屉与 Modal 共用的列表内容组件
  const renderBookList = () => (
    <>
      {books?.map((book) => {
        const isCurrentBookPending = pendingBookId === book.id
        return (
          <Button
            key={book.id}
            size="lg"
            variant="tertiary"
            fullWidth={true}
            className="bg-white text-black font-medium shadow-sm border border-gray-100 hover:bg-default-100 transition-colors duration-200 flex items-center justify-start gap-3"
            onPress={() => {
              setPendingBookId(book.id)
              router.push(currentRouter + '/' + book.data_source_id)
            }}
            isPending={isCurrentBookPending}
            isDisabled={pendingBookId !== null && !isCurrentBookPending}
          >
            {() => (
              <>
                {isCurrentBookPending ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <>
                    {book?.icon ? (
                      <img
                        src={book.icon}
                        alt="Icon"
                        decoding="async"
                        className="w-5 h-5 object-cover rounded-lg shrink-0"
                      />
                    ) : (
                      <RedoDot className="w-5 h-5 shrink-0" />
                    )}
                  </>
                )}
                <span className="truncate">{book?.name || 'Word Swipe'}</span>
              </>
            )}
          </Button>
        )
      })}
    </>
  )

  return (
    <div className="w-full min-h-screen max-w-md mx-auto px-5 flex flex-col justify-center items-center gap-8 box-border">
      {/* 头部区域 */}
      {baseInfo?.title && (
        <div className="w-full text-center flex flex-col gap-2 select-none animate-fade-in">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            {baseInfo?.title || ''}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 max-w-xs mx-auto leading-relaxed">
            {baseInfo?.description ||
              'A beautifully simple way to practice, retain, and conquer new vocabulary.'}
          </p>
        </div>
      )}

      {/* 按钮主菜单 */}
      <div className="w-full flex flex-col gap-4 box-border pb-20">
        <Button
          size="lg"
          variant="tertiary"
          fullWidth={true}
          className="bg-white text-black font-medium shadow-sm hover:bg-default-100 transition-colors duration-200"
          onPress={() => {
            setIsPendingWordSwipe(true)
            handle('/wordSwipe')
          }}
          isPending={isPendingWordSwipe}
        >
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : <RedoDot />}
              Word Swipe
            </>
          )}
        </Button>

        <Button
          size="lg"
          variant="tertiary"
          fullWidth={true}
          className="bg-white text-black font-medium shadow-sm hover:bg-default-100 transition-colors duration-200"
          onPress={() => {
            setIsPendingWordMatch(true)
            handle('/wordMatch')
          }}
          isPending={isPendingWordMatch}
        >
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : <Spline />}
              Word Match
            </>
          )}
        </Button>

        <Button
          size="lg"
          variant="tertiary"
          fullWidth={true}
          className="bg-white text-black font-medium shadow-sm hover:bg-default-100 transition-colors duration-200"
          onPress={() => {
            setIsPendingLetterFill(true)
            handle('/letterFill')
          }}
          isPending={isPendingLetterFill}
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <BetweenVerticalStart />
              )}
              Letter Fill
            </>
          )}
        </Button>

        <Button
          size="lg"
          variant="tertiary"
          fullWidth={true}
          className="hidden md:flex bg-white text-black font-medium shadow-sm hover:bg-default-100 transition-colors duration-200"
          onPress={() => {
            setIsPendingWordSpell(true)
            handle('/wordSpell')
          }}
          isPending={isPendingWordSpell}
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <TextCursorInput />
              )}
              Word Spell
            </>
          )}
        </Button>

        {/* ======================================================= */}
        {/* 统一弹窗管理：通过 Tailwind 媒体查询（md:）在 PC 和 H5 间无缝切换 */}
        {/* ======================================================= */}
        <div
          className={`fixed inset-0 z-50 transition-all duration-300 ${
            isOpen ? 'visible' : 'invisible pointer-events-none'
          }`}
        >
          {/* 1. 全局 Backdrop 遮罩 */}
          <div
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
              isOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={handleClose}
          />

          {/* 2. 【H5 移动端】底部的抽屉样式（在 md 尺寸以上隐藏：md:hidden） */}
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`
              md:hidden
              fixed bottom-0 left-0 right-0 z-50 
              h-auto max-h-[85vh] w-full max-w-md mx-auto
              bg-white rounded-t-2xl shadow-2xl 
              flex flex-col 
              ${isDragging ? '' : 'transition-transform duration-300 ease-out'}
            `}
            style={{
              transform: isOpen
                ? `translateY(${currentTranslateY}px)`
                : 'translateY(100%)',
            }}
          >
            {/* 视觉把手 */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-3 flex-shrink-0 cursor-grab active:cursor-grabbing" />
            <div className="flex items-center justify-center pb-4 px-4 border-b border-gray-100 flex-shrink-0 select-none">
              <h2 className="text-lg font-semibold text-gray-900">
                Choose Vocabulary Book
              </h2>
            </div>
            {/* 滚动内容区 */}
            <div
              ref={bodyRef}
              className="flex-1 overflow-y-auto pl-5 pr-5 pt-6 pb-10 flex flex-col gap-4"
            >
              {renderBookList()}
            </div>
          </div>

          {/* 3. 【PC 桌面端】标准的 Modal.Backdrop 居中弹窗样式（在 md 以下尺寸隐藏：hidden md:flex） */}
          <div
            className={`
              hidden md:flex
              fixed inset-0 z-50 items-center justify-center p-4
              transition-all duration-300 ease-out
              ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
            `}
            onClick={handleClose}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col"
            >
              {/* PC 弹窗头部 */}
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">
                  Choose Vocabulary Book
                </h2>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors text-sm font-medium"
                >
                  ✕
                </button>
              </div>
              {/* PC 弹窗内容区 */}
              <div className="p-10 max-h-[60vh] overflow-y-auto flex flex-col gap-3">
                {renderBookList()}
              </div>
            </div>
          </div>
        </div>
        {/* ======================================================= */}
      </div>
    </div>
  )
}
