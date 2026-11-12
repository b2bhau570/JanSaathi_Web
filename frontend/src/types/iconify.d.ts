import 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          icon: string;
          width?: string | number;
          height?: string | number;
          rotate?: string | number;
          flip?: string;
          mode?: string;
          inline?: boolean;
        },
        HTMLElement
      >;
    }
  }

  namespace React.JSX {
    interface IntrinsicElements {
      'iconify-icon': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          icon: string;
          width?: string | number;
          height?: string | number;
          rotate?: string | number;
          flip?: string;
          mode?: string;
          inline?: boolean;
        },
        HTMLElement
      >;
    }
  }
}

