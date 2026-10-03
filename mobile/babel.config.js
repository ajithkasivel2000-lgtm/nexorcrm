module.exports = function(api) {
  api.cache(true);
  return {
    // babel-preset-expo adds the react-native-worklets plugin (Reanimated 4)
    // on its own; listing it here as well would run it twice.
    presets: ['babel-preset-expo'],
  };
};
