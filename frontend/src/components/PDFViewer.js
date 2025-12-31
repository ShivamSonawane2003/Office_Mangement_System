import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up worker - try local first, fallback to CDN
const pdfjsVersion = pdfjsLib.version || '3.11.174';
try {
  // Try local worker file first (copied to public folder)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
} catch (e) {
  // Fallback to CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.js`;
}
console.log('PDF.js Worker Source:', pdfjsLib.GlobalWorkerOptions.workerSrc);

function PDFViewer({ url, zoom = 1, onLoad }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState(null);
  const prevUrlRef = useRef(null);

  useEffect(() => {
    // Reset state when URL changes
    if (prevUrlRef.current !== url) {
      setLoading(true);
      setError(null);
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      prevUrlRef.current = url;
    }

    if (!url) {
      setError('No PDF URL provided');
      setLoading(false);
      return;
    }

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);
        setPdfDoc(null);

        console.log('Loading PDF from URL:', url);

        // Fetch the PDF file with timeout
        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => fetchController.abort(), 30000); // 30 second timeout
        
        let response;
        try {
          response = await fetch(url, { signal: fetchController.signal });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('PDF loading timeout. The PDF file may be too large or the connection is slow.');
          }
          throw fetchError;
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('PDF file is empty');
        }

        console.log('PDF fetched, size:', arrayBuffer.byteLength);

        // Load the PDF document with timeout
        const loadingTask = pdfjsLib.getDocument({ 
          data: arrayBuffer,
          verbosity: 0, // Reduce console warnings
          stopAtErrors: false,
          maxImageSize: 1024 * 1024, // 1MB max image size
        });
        
        // Add timeout to PDF loading
        const loadingPromise = loadingTask.promise;
        const loadingTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('PDF parsing timeout')), 30000);
        });
        
        const pdf = await Promise.race([loadingPromise, loadingTimeout]);
        console.log('PDF loaded successfully, pages:', pdf.numPages);

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        // Keep loading true - will be set to false after page renders
        
        // Scroll to top when PDF loads
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
            scrollContainerRef.current.scrollLeft = 0;
          }
        }, 100);
        
        if (onLoad) {
          setTimeout(() => onLoad(), 100); // Small delay to ensure state is updated
        }
      } catch (err) {
        console.error('Error loading PDF:', err);
        const errorMessage = err.message || 'Failed to load PDF. Please try again.';
        setError(errorMessage);
        setLoading(false);
        if (onLoad) {
          setTimeout(() => onLoad(), 100); // Call onLoad even on error to hide parent loading state
        }
      }
    };

    loadPDF();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!pdfDoc) return;

    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 10;

    const renderPage = async (pageNum) => {
      // Cancel any existing render task and wait for it to complete
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
          // Wait a brief moment for cancellation to complete
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (cancelErr) {
          // Ignore cancellation errors
          console.log('Cancelled previous render task');
        }
        renderTaskRef.current = null;
      }
      
      // Double-check if still mounted after cancellation
      if (!isMounted) return;

      // Wait for canvas to be available with retry logic
      if (!canvasRef.current) {
        retryCount++;
        if (retryCount < maxRetries && isMounted) {
          setTimeout(() => renderPage(pageNum), 100);
          return;
        } else {
          if (isMounted) {
            setError('Canvas element not available for rendering');
            setLoading(false);
          }
          return;
        }
      }

      if (!isMounted) return;

      try {
        console.log('Rendering page:', pageNum);
        setLoading(true); // Show loading while rendering
        
        const page = await pdfDoc.getPage(pageNum);
        if (!isMounted) return;
        
        const canvas = canvasRef.current;
        if (!canvas) {
          if (isMounted) {
            setError('Canvas element lost during rendering');
            setLoading(false);
          }
          return;
        }
        
        const context = canvas.getContext('2d');
        if (!context) {
          if (isMounted) {
            setError('Could not get canvas context');
            setLoading(false);
          }
          return;
        }

        // Calculate scale based on zoom
        // Use a higher base scale for better quality and full PDF visibility
        const baseScale = 2.0;
        const scale = baseScale * zoom;
        const scaledViewport = page.getViewport({ scale });

        // Set canvas dimensions - this will clear any previous content
        canvas.width = Math.ceil(scaledViewport.width);
        canvas.height = Math.ceil(scaledViewport.height);

        // Clear canvas with white background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };

        // Create new render task and store it
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        
        // Wait for render to complete
        await renderTask.promise;
        
        // Clear the task ref after successful completion
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
        
        if (!isMounted) return;
        
        console.log('Page rendered successfully');
        setLoading(false);
        
        // Scroll to top when page renders
        setTimeout(() => {
          if (scrollContainerRef.current && isMounted) {
            scrollContainerRef.current.scrollTop = 0;
            scrollContainerRef.current.scrollLeft = 0;
          }
        }, 50);
      } catch (err) {
        // Clear task ref on error
        if (renderTaskRef.current) {
          renderTaskRef.current = null;
        }
        
        // Ignore cancellation errors as they're expected when switching pages/zoom
        if (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled')) {
          console.log('Render cancelled (expected)');
          return;
        }
        
        console.error('Error rendering page:', err);
        if (isMounted) {
          const errorMessage = err.message || 'Unknown error';
          // Don't show error for cancellation
          if (!errorMessage.includes('cancelled') && !errorMessage.includes('same canvas')) {
            setError(`Failed to render PDF page: ${errorMessage}`);
          }
          setLoading(false);
        }
      }
    };

    renderPage(currentPage);

    return () => {
      isMounted = false;
      // Cancel any ongoing render task on unmount or dependency change
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (cancelErr) {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, currentPage, zoom]);

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < numPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (loading && !pdfDoc) {
    return (
      <div className="bill-preview-loading" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
        <div>Loading PDF…</div>
        {error && <div style={{ color: '#f87171', fontSize: '12px' }}>{error}</div>}
      </div>
    );
  }

  if (error && !pdfDoc) {
    return (
      <div className="bill-preview-error" style={{ width: '100%', height: '100%', textAlign: 'center', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
        <div>{error}</div>
        {url && (
          <a href={url} download="document.pdf" style={{ color: '#667eea', textDecoration: 'underline', marginTop: '10px' }}>
            Download PDF instead
          </a>
        )}
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {loading && (
        <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '4px', fontSize: '12px', zIndex: 10 }}>
          {pdfDoc ? `Rendering page ${currentPage}...` : 'Loading PDF...'}
        </div>
      )}
      <div 
        ref={scrollContainerRef}
        style={{ 
          flex: 1, 
          width: '100%',
          overflowY: 'auto',
          overflowX: 'auto',
          padding: '20px',
          backgroundColor: '#f5f5f5',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          position: 'relative'
        }}
      >
        {pdfDoc && (
          <canvas 
            ref={canvasRef} 
            style={{ 
              width: 'auto',
              height: 'auto',
              maxWidth: '100%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)', 
              backgroundColor: '#fff',
              display: 'block',
              margin: '0 auto'
            }} 
          />
        )}
        {error && pdfDoc && !error.includes('cancelled') && !error.includes('same canvas') && (
          <div style={{ color: '#f87171', marginTop: '10px', textAlign: 'center', padding: '10px' }}>{error}</div>
        )}
      </div>
      {numPages > 1 && (
        <div style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #e0e0e0', width: '100%', justifyContent: 'center' }}>
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              background: currentPage <= 1 ? '#f5f5f5' : '#fff',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              background: currentPage >= numPages ? '#f5f5f5' : '#fff',
              cursor: currentPage >= numPages ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default PDFViewer;

