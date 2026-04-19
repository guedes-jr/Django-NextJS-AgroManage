import { HTMLAttributes, forwardRef, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", header, footer, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-4 p-0 ${className}`}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-soft)",
        }}
        {...props}
      >
        {header && <div className="p-4 pb-0">{header}</div>}
        <div className="p-4">{children}</div>
        {footer && <div className="p-4 pt-0">{footer}</div>}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div ref={ref} className={className} {...props}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = "CardContent";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`d-flex flex-row justify-content-between align-items-start ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = "", ...props }, ref) => {
    return <h5 ref={ref} className={`mb-0 ${className}`} {...props} />;
  }
);

CardTitle.displayName = "CardTitle";