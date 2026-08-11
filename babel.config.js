module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
          },
        },
      ],
      // Reanimated 4 moved its worklets transform into react-native-worklets.
      // This MUST stay last in the plugins list.
      'react-native-worklets/plugin',
    ],
  };
};
