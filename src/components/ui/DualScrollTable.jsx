/**
 * DualScrollTable — envuelve una tabla con scroll sincronizado arriba y abajo.
 * En desktop: barra de scroll arriba + abajo sincronizadas.
 * En mobile: se comporta igual que cp-table-wrap normal (sin barra superior).
 *
 * Uso:
 *   <DualScrollTable className="cp-compact-list">
 *     <table className="cp-table">...</table>
 *   </DualScrollTable>
 */
import { useEffect, useRef } from 'react';
import './DualScrollTable.css';

export default function DualScrollTable({ children, className = '', style }) {
  const topBarRef = useRef(null);
  const topInnerRef = useRef(null);
  const bottomRef = useRef(null);
  const syncing = useRef(false);

  useEffect(() => {
    const topBar = topBarRef.current;
    const topInner = topInnerRef.current;
    const bottom = bottomRef.current;
    if (!topBar || !topInner || !bottom) return;

    function syncWidth() {
      topInner.style.width = bottom.scrollWidth + 'px';
    }

    function onTopScroll() {
      if (syncing.current) return;
      syncing.current = true;
      bottom.scrollLeft = topBar.scrollLeft;
      syncing.current = false;
    }

    function onBottomScroll() {
      if (syncing.current) return;
      syncing.current = true;
      topBar.scrollLeft = bottom.scrollLeft;
      syncing.current = false;
    }

    syncWidth();
    const ro = new ResizeObserver(syncWidth);
    ro.observe(bottom);

    topBar.addEventListener('scroll', onTopScroll, { passive: true });
    bottom.addEventListener('scroll', onBottomScroll, { passive: true });

    return () => {
      ro.disconnect();
      topBar.removeEventListener('scroll', onTopScroll);
      bottom.removeEventListener('scroll', onBottomScroll);
    };
  }, []);

  return (
    <div className={`cp-dual-scroll-outer ${className}`} style={style}>
      {/* Barra fantasma superior — solo desktop */}
      <div ref={topBarRef} className="cp-dual-scroll__top-bar">
        <div ref={topInnerRef} className="cp-dual-scroll__top-inner" />
      </div>
      {/* Contenido real con scroll inferior */}
      <div ref={bottomRef} className="cp-dual-scroll__content cp-table-wrap">
        {children}
      </div>
    </div>
  );
}
