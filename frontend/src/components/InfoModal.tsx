import { useState, useEffect } from 'react'
import './InfoModal.css'

interface InfoModalProps {
  onClose: () => void
}

const InfoModal = ({ onClose }: InfoModalProps) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Small delay for animation
    setTimeout(() => setIsVisible(true), 10)
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => onClose(), 300) // Wait for animation
  }

  return (
    <div className={`modal-overlay ${isVisible ? 'visible' : ''}`} onClick={handleClose}>
      <div className={`modal-content ${isVisible ? 'visible' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>×</button>
        <div className="modal-body">
          <h2>Welcome to Polymarket Trading Bot</h2>
          <p>
            Hi, I am Trong Truong Pham from freelancer.com. Please contact me with the following telegram username: <strong>@ttp_trading</strong>
          </p>
        </div>
      </div>
    </div>
  )
}

export default InfoModal

