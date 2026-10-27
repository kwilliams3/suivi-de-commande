import { useEffect, useRef } from 'react';

export function useOrdersRefresh(load: () => void) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => latest.current(), 250); };
    window.addEventListener('orders-changed', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('orders-changed', refresh); };
  }, []);
}
