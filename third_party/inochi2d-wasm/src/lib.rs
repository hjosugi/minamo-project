use std::collections::HashMap;

use glam::{vec2, Vec2};
use inox2d::formats::inp::parse_inp;
use inox2d::puppet::Puppet;
use inox2d::render::InoxRendererExt;
use inox2d_opengl::OpenglRenderer;
use wasm_bindgen::{prelude::*, JsCast};

/// Minimal browser boundary around the official Inox2D renderer. File metadata
/// and parameter discovery stay in JavaScript so this crate does not fork
/// Inox2D merely to expose its private parameter map.
#[wasm_bindgen]
pub struct InoxModel {
    puppet: Puppet,
    renderer: OpenglRenderer,
    pending: HashMap<String, Vec2>,
}

#[wasm_bindgen]
impl InoxModel {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8], canvas_id: &str) -> Result<InoxModel, JsValue> {
        let canvas = web_sys::window()
            .ok_or_else(|| js_error("window is unavailable"))?
            .document()
            .ok_or_else(|| js_error("document is unavailable"))?
            .get_element_by_id(canvas_id)
            .ok_or_else(|| js_error(&format!("canvas #{canvas_id} was not found")))?
            .dyn_into::<web_sys::HtmlCanvasElement>()
            .map_err(|_| js_error(&format!("#{canvas_id} is not a canvas")))?;

        let options = js_sys::Object::new();
        js_sys::Reflect::set(&options, &"alpha".into(), &true.into())?;
        js_sys::Reflect::set(&options, &"antialias".into(), &true.into())?;
        js_sys::Reflect::set(&options, &"premultipliedAlpha".into(), &true.into())?;
        js_sys::Reflect::set(&options, &"stencil".into(), &true.into())?;
        let gl = canvas
            .get_context_with_context_options("webgl2", &options)?
            .ok_or_else(|| js_error("WebGL2 is unavailable"))?
            .dyn_into::<web_sys::WebGl2RenderingContext>()
            .map_err(|_| js_error("failed to create a WebGL2 context"))?;

        let mut model = parse_inp(bytes)
            .map_err(|error| js_error(&format!("Inochi2D parse failed: {error}")))?;
        model.puppet.init_transforms();
        model.puppet.init_rendering();
        model.puppet.init_params();
        model.puppet.init_physics();

        let gl_context = glow::Context::from_webgl2_context(gl);
        let mut renderer = OpenglRenderer::new(gl_context, &model)
            .map_err(|error| js_error(&format!("Inochi2D renderer failed: {error}")))?;
        renderer.camera.scale = Vec2::splat(0.15);
        renderer.resize(canvas.width(), canvas.height());

        Ok(Self {
            puppet: model.puppet,
            renderer,
            pending: HashMap::new(),
        })
    }

    pub fn set_parameter(&mut self, name: &str, value: f32) -> Result<(), JsValue> {
        self.validate_parameter(name, vec2(value, 0.0))?;
        self.pending.insert(name.to_owned(), vec2(value, 0.0));
        Ok(())
    }

    pub fn set_parameter_2d(&mut self, name: &str, x: f32, y: f32) -> Result<(), JsValue> {
        self.validate_parameter(name, vec2(x, y))?;
        self.pending.insert(name.to_owned(), vec2(x, y));
        Ok(())
    }

    /// Advances exactly one caller-owned frame. Parameters are queued by
    /// set_parameter so begin_frame cannot reset a value before it is applied.
    pub fn update(&mut self, delta_time: f32) -> Result<(), JsValue> {
        self.puppet.begin_frame();
        let param_ctx = self
            .puppet
            .param_ctx
            .as_mut()
            .ok_or_else(|| js_error("Inochi2D parameter context is unavailable"))?;
        for (name, value) in self.pending.drain() {
            param_ctx
                .set(&name, value)
                .map_err(|error| js_error(&error.to_string()))?;
        }
        self.puppet.end_frame(delta_time.clamp(0.0, 0.1));
        Ok(())
    }

    pub fn draw(&self) {
        self.renderer.clear();
        self.renderer.on_begin_draw(&self.puppet);
        self.renderer.draw(&self.puppet);
        self.renderer.on_end_draw(&self.puppet);
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.renderer.resize(width.max(1), height.max(1));
    }

    pub fn set_camera_scale(&mut self, scale: f32) {
        self.renderer.camera.scale = Vec2::splat(scale.clamp(0.001, 10.0));
    }

    pub fn set_camera_position(&mut self, x: f32, y: f32) {
        self.renderer.camera.position = vec2(x, y);
    }

    pub fn get_name(&self) -> String {
        self.puppet.meta.name.clone().unwrap_or_default()
    }

    pub fn get_author(&self) -> String {
        self.puppet.meta.artist.clone().unwrap_or_default()
    }
}

impl InoxModel {
    fn validate_parameter(&mut self, name: &str, value: Vec2) -> Result<(), JsValue> {
        self.puppet
            .param_ctx
            .as_mut()
            .ok_or_else(|| js_error("Inochi2D parameter context is unavailable"))?
            .set(name, value)
            .map_err(|error| js_error(&error.to_string()))
    }
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
