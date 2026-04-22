import './Card.css';

export default function Card({ children, padding = 'md', className = '', ...rest }) {
  return (
    <div className={`cp-card cp-card--p-${padding} ${className}`} {...rest}>
      {children}
    </div>
  );
}
