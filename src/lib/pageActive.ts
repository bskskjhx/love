import { createContext, useContext } from 'react'

export const PageActive = createContext(true)

export const usePageActive = () => useContext(PageActive)
