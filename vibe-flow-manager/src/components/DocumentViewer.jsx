import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

/**
 * DocumentViewer - 다양한 문서 형식을 지원하는 통합 뷰어
 * - Markdown (.md, .markdown)
 * - PDF (.pdf)
 * - Text (.txt, .log)
 * - Code (추후 확장)
 */
function DocumentViewer({ filePath, content, onClose }) {
    const [documentContent, setDocumentContent] = useState(content || '')
    const [documentType, setDocumentType] = useState('text')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // PDF 관련 상태
    const [numPages, setNumPages] = useState(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [scale, setScale] = useState(1.0)

    // 파일 확장자로 문서 타입 결정
    const getDocumentType = (path) => {
        if (!path) return 'text'
        const ext = path.split('.').pop()?.toLowerCase()

        if (['md', 'markdown'].includes(ext)) return 'markdown'
        if (ext === 'pdf') return 'pdf'
        if (['txt', 'log', 'text'].includes(ext)) return 'text'
        if (['js', 'jsx', 'ts', 'tsx', 'py', 'json', 'css', 'html'].includes(ext)) return 'code'

        return 'text'
    }

    // 파일 로드
    useEffect(() => {
        const loadDocument = async () => {
            if (content) {
                setDocumentContent(content)
                setDocumentType(getDocumentType(filePath))
                return
            }

            if (!filePath) return

            setLoading(true)
            setError(null)

            try {
                const type = getDocumentType(filePath)
                setDocumentType(type)

                if (type === 'pdf') {
                    // PDF는 파일 경로를 직접 사용
                    setDocumentContent(filePath)
                } else {
                    // 텍스트 기반 파일은 내용을 로드
                    const result = await window.electronAPI.readFile(filePath)
                    setDocumentContent(result)
                }
            } catch (err) {
                setError(`문서를 불러올 수 없습니다: ${err.message}`)
            } finally {
                setLoading(false)
            }
        }

        loadDocument()
    }, [filePath, content])

    // PDF 로드 성공 핸들러
    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages)
        setCurrentPage(1)
    }

    // PDF 페이지 네비게이션
    const goToPrevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1))
    const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, numPages || prev))

    // 확대/축소
    const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3))
    const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5))
    const resetZoom = () => setScale(1.0)

    // 로딩 상태
    if (loading) {
        return (
            <div className="document-viewer">
                <div className="document-viewer-loading">
                    <div className="loading-spinner"></div>
                    <p>문서 로딩 중...</p>
                </div>
            </div>
        )
    }

    // 에러 상태
    if (error) {
        return (
            <div className="document-viewer">
                <div className="document-viewer-error">
                    <span className="error-icon">⚠️</span>
                    <p>{error}</p>
                    {onClose && (
                        <button onClick={onClose} className="btn btn-secondary">닫기</button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="document-viewer">
            {/* 문서 헤더 */}
            <div className="document-viewer-header">
                <div className="document-info">
                    <span className="document-type-badge">{documentType.toUpperCase()}</span>
                    {filePath && (
                        <span className="document-path" title={filePath}>
                            {filePath.split(/[/\\]/).pop()}
                        </span>
                    )}
                </div>

                <div className="document-controls">
                    {/* PDF 컨트롤 */}
                    {documentType === 'pdf' && numPages && (
                        <>
                            <div className="page-controls">
                                <button
                                    onClick={goToPrevPage}
                                    disabled={currentPage <= 1}
                                    className="control-btn"
                                >
                                    ◀
                                </button>
                                <span className="page-info">
                                    {currentPage} / {numPages}
                                </span>
                                <button
                                    onClick={goToNextPage}
                                    disabled={currentPage >= numPages}
                                    className="control-btn"
                                >
                                    ▶
                                </button>
                            </div>
                            <div className="zoom-controls">
                                <button onClick={zoomOut} className="control-btn">➖</button>
                                <button onClick={resetZoom} className="control-btn">
                                    {Math.round(scale * 100)}%
                                </button>
                                <button onClick={zoomIn} className="control-btn">➕</button>
                            </div>
                        </>
                    )}

                    {onClose && (
                        <button onClick={onClose} className="control-btn close-btn">✕</button>
                    )}
                </div>
            </div>

            {/* 문서 콘텐츠 */}
            <div className="document-viewer-content">
                {/* Markdown 렌더링 */}
                {documentType === 'markdown' && (
                    <div className="markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {documentContent}
                        </ReactMarkdown>
                    </div>
                )}

                {/* PDF 렌더링 */}
                {documentType === 'pdf' && (
                    <div className="pdf-content">
                        <Document
                            file={documentContent}
                            onLoadSuccess={onDocumentLoadSuccess}
                            loading={<div className="pdf-loading">PDF 로딩 중...</div>}
                            error={<div className="pdf-error">PDF를 불러올 수 없습니다</div>}
                        >
                            <Page
                                pageNumber={currentPage}
                                scale={scale}
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                            />
                        </Document>
                    </div>
                )}

                {/* 일반 텍스트 렌더링 */}
                {(documentType === 'text' || documentType === 'code') && (
                    <div className="text-content">
                        <pre>
                            <code>{documentContent}</code>
                        </pre>
                    </div>
                )}
            </div>
        </div>
    )
}

export default DocumentViewer
