import { HTMLAttributes, forwardRef, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  header?: ReactNode;
  footer?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", title, header, footer, children, ...props }, ref) => {
    return (
      <div ref={ref} className={`card card-agro ${className}`} {...props}>
        {title && (
          <div className="card-header">
            <h5 className="card-title mb-0">{title}</h5>
          </div>
        )}
        {header && <div className="card-header">{header}</div>}
        <div className="card-body">{children}</div>
        {footer && <div className="card-footer">{footer}</div>}
      </div>
    );
  }
);

Card.displayName = "Card";

interface CardTextProps extends HTMLAttributes<HTMLParagraphElement> {
  muted?: boolean;
}

export const CardText = forwardRef<HTMLParagraphElement, CardTextProps>(
  ({ className = "", muted = false, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={`card-text ${muted ? "text-muted" : ""} ${className}`}
        {...props}
      />
    );
  }
);

CardText.displayName = "CardText";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = "", ...props }, ref) => {
    return <h5 ref={ref} className={`card-title ${className}`} {...props} />;
  }
);

CardTitle.displayName = "CardTitle";