use damas_common::ClientMsg;
use leptos::*;
use crate::{UserInfo, ws::WsCtx};

pub fn auth_card() -> impl IntoView {
    let ws        = use_context::<WsCtx>().unwrap();
    let set_user  = use_context::<WriteSignal<Option<UserInfo>>>().unwrap();

    let username = create_rw_signal(String::new());
    let password = create_rw_signal(String::new());
    let error    = create_rw_signal(String::new());
    let mode     = create_rw_signal("login"); // "login" | "register"

    let submit = move |_| {
        let u = username.get();
        let p = password.get();
        if u.trim().is_empty() || p.is_empty() {
            error.set("Completa todos los campos.".into());
            return;
        }
        // Call REST API
        let mode_str = mode.get();
        let url = format!("/api/auth/{mode_str}");
        let body = serde_json::json!({ "username": u, "password": p });
        let set_user2 = set_user.clone();
        let ws2 = ws.clone();
        let error2 = error.clone();
        spawn_local(async move {
            let window = web_sys::window().unwrap();
            let mut opts = web_sys::RequestInit::new();
            opts.method("POST");
            opts.body(Some(&wasm_bindgen::JsValue::from_str(&body.to_string())));
            let request = web_sys::Request::new_with_str_and_init(&url, &opts).unwrap();
            request.headers().set("Content-Type", "application/json").ok();
            let resp_value = wasm_bindgen_futures::JsFuture::from(window.fetch_with_request(&request))
                .await;
            match resp_value {
                Ok(resp) => {
                    let resp: web_sys::Response = resp.unchecked_into();
                    if resp.ok() {
                        let json_fut = wasm_bindgen_futures::JsFuture::from(resp.json().unwrap());
                        if let Ok(json) = json_fut.await {
                            let obj: serde_json::Value = serde_wasm_bindgen::from_value(json)
                                .unwrap_or_default();
                            let id  = obj["id"].as_str().unwrap_or("").to_string();
                            let uname = obj["username"].as_str().unwrap_or("").to_string();
                            if !id.is_empty() {
                                ws2.send(&ClientMsg::Auth { user_id: id.clone(), username: uname.clone() });
                                set_user2.set(Some(UserInfo { id, username: uname }));
                                error2.set(String::new());
                            }
                        }
                    } else {
                        error2.set("Usuario o contraseña incorrectos.".into());
                    }
                }
                Err(_) => error2.set("Error de conexión.".into()),
            }
        });
    };

    view! {
        <div class="card" style="width:320px">
            <h2>"Damas 8×8"</h2>
            <div class="row" style="margin-bottom:12px">
                <button
                    class:ghost={move || mode.get() != "login"}
                    on:click=move |_| mode.set("login")>
                    "Iniciar sesión"
                </button>
                <button
                    class:ghost={move || mode.get() != "register"}
                    on:click=move |_| mode.set("register")>
                    "Registrarse"
                </button>
            </div>
            <div class="col">
                <input placeholder="Usuario" prop:value=username
                    on:input=move |e| username.set(event_target_value(&e)) />
                <input type="password" placeholder="Contraseña" prop:value=password
                    on:input=move |e| password.set(event_target_value(&e))
                    on:keydown=move |e| {
                        if e.key() == "Enter" { submit(()); }
                    } />
                <button on:click=submit>
                    {move || if mode.get() == "login" { "Entrar" } else { "Crear cuenta" }}
                </button>
                {move || if error.get().is_empty() { view!{<span></span>}.into_view() } else {
                    view!{<span style="color:var(--red);font-size:13px">{ error.get() }</span>}.into_view()
                }}
            </div>
        </div>
    }
}
