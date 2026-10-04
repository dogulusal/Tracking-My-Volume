import { createContext, useContext } from 'react';

/**
 * Set where someone else's records are shown (a coach looking at an
 * athlete): the same screens, with every control that would change the
 * records left out instead of quietly doing nothing.
 */
export const ReadOnlyContext = createContext(false);

export const useReadOnly = () => useContext(ReadOnlyContext);
