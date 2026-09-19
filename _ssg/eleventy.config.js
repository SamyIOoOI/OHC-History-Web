export default function(eleventyConfig){
    return {
        htmlTemplateEngine: "liquid",
        dir: {
            input: 'src',
            output: "_dist"
        }
    };
};