/** @type {import('tailwindcss').Config} */
const primaryColourShades = {
  100: '#6f92ff',
  200: '#5987ff',
  300: '#3c73ff',
  400: '#2863ff',
  500: '#0043ff',
  600: '#0039d7',
  700: '#0027b7',
  800: '#002883',
  900: '#001d72',
}

const successColourShades = {
  100: '#a6f0b3',
  200: '#8deca2',
  300: '#75e891',
  400: '#5fe480',
  500: '#2dd36f',
  600: '#28be64',
  700: '#22a859',
  800: '#1d924e',
  900: '#187c43',
}

const warningColourShades = {
  100: '#ffe8a1',
  200: '#ffdf8b',
  300: '#ffd675',
  400: '#ffcd5f',
  500: '#ffc409',
  600: '#e6b008',
  700: '#cc9c07',
  800: '#b38806',
  900: '#996f05',
}

const greyColourShades = {
  100: '#f1f1f1',  // Adjust the RGB part accordingly
  200: '#dcdcdc',
  300: '#c6c6c6',
  400: '#b0b0b0',
  500: '#939393',  // Your main color
  600: '#808080',  // Adjust the RGB part accordingly
  700: '#6b6b6b',
  800: '#555555',
  900: '#404040'
}

module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {},
    colors: {
      transparent: 'transparent',
      'primary': primaryColourShades,
      'warning': warningColourShades,
      'success': successColourShades,
      'grey': greyColourShades,
    },
    borderColor:{
      'primary': primaryColourShades,
      'warning': warningColourShades,
      'success': successColourShades,
      'grey': greyColourShades,
    }
  },
  plugins: [],
}

