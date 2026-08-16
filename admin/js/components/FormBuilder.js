export class FormBuilder {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.referenceData = {};
  }

  setReferenceData(key, data) {
    this.referenceData[key] = data || [];
  }

  build(data = {}) {
    this.container.innerHTML = '';
    const fields = this.config.fields || [];

    if (this.config.single) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'id';
      hidden.value = data.id || '';
      this.container.appendChild(hidden);
    }

    for (const field of fields) {
      const group = document.createElement('div');
      group.className = 'form-group';

      const label = document.createElement('label');
      label.setAttribute('for', `field-${field.key}`);
      label.textContent = field.label + (field.required ? ' *' : '');
      group.appendChild(label);

      const value = data[field.key] !== undefined ? data[field.key] : '';

      if (field.type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.id = `field-${field.key}`;
        textarea.name = field.key;
        textarea.textContent = value;
        if (field.required) textarea.required = true;
        group.appendChild(textarea);
      } else if (field.type === 'select') {
        const select = document.createElement('select');
        select.id = `field-${field.key}`;
        select.name = field.key;

        if (field.options && Array.isArray(field.options)) {
          select.innerHTML = '<option value="">Seleccionar...</option>';
          for (const opt of field.options) {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            if (value === opt) option.selected = true;
            select.appendChild(option);
          }
        } else if (field.reference) {
          select.innerHTML = '<option value="">Seleccionar...</option>';
          const refItems = this.referenceData[field.reference] || [];
          for (const item of refItems) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name || item.title || item.platform || item.material || `#${item.id}`;
            if (value === item.id) option.selected = true;
            select.appendChild(option);
          }
        }

        if (field.required) select.required = true;
        group.appendChild(select);
      } else if (field.type === 'checkbox') {
        const checkboxGroup = document.createElement('div');
        checkboxGroup.className = 'checkbox-group';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `field-${field.key}`;
        checkbox.name = field.key;
        checkbox.checked = Boolean(value);
        checkboxGroup.appendChild(checkbox);
        const checkLabel = document.createElement('label');
        checkLabel.setAttribute('for', `field-${field.key}`);
        checkLabel.textContent = field.label;
        checkboxGroup.appendChild(checkLabel);
        group.appendChild(checkboxGroup);
      } else if (field.type === 'file') {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '8px';
        const preview = document.createElement('img');
        preview.style.maxWidth = '200px';
        preview.style.maxHeight = '150px';
        preview.style.borderRadius = '8px';
        preview.style.objectFit = 'cover';
        preview.style.border = '1px solid var(--border)';
        if (value) {
          preview.src = value;
          preview.style.display = 'block';
        } else {
          preview.style.display = 'none';
        }
        wrapper.appendChild(preview);
        const input = document.createElement('input');
        input.type = 'file';
        input.id = `field-${field.key}`;
        input.name = field.key;
        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const btn = input.nextElementSibling;
          if (btn) btn.disabled = true;
          try {
            const { getSession } = await import('../auth.js');
            const session = getSession();
            if (!session) throw new Error('No autenticado');
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('https://nexus.cuatrinismaelabrahan.workers.dev/api/admin/upload', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${session.access_token}` },
              body: formData,
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            preview.src = data.url;
            preview.style.display = 'block';
            const hidden = wrapper.querySelector('input[type="hidden"]');
            if (hidden) hidden.value = data.url;
          } catch (err) {
            alert('Error al subir imagen: ' + err.message);
          } finally {
            if (btn) btn.disabled = false;
          }
        });
        input.style.display = 'none';
        wrapper.appendChild(input);
        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.className = 'btn btn-sm btn-outline';
        uploadBtn.textContent = value ? 'Cambiar imagen' : 'Subir imagen';
        uploadBtn.addEventListener('click', () => input.click());
        wrapper.appendChild(uploadBtn);
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = field.key;
        hidden.id = `hidden-${field.key}`;
        hidden.value = value || '';
        wrapper.appendChild(hidden);
        group.appendChild(wrapper);
      } else if (field.type === 'color') {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.gap = '8px';
        wrapper.style.alignItems = 'center';
        const input = document.createElement('input');
        input.type = 'color';
        input.id = `field-${field.key}`;
        input.name = field.key;
        input.value = value || '#000000';
        wrapper.appendChild(input);
        const text = document.createElement('input');
        text.type = 'text';
        text.value = value || '';
        text.style.width = '120px';
        text.style.padding = '8px 12px';
        text.style.border = '1px solid var(--border)';
        text.style.borderRadius = 'var(--radius)';
        text.style.fontSize = '0.9rem';
        text.addEventListener('input', () => { input.value = text.value; });
        input.addEventListener('input', () => { text.value = input.value; });
        wrapper.appendChild(text);
        group.appendChild(wrapper);
      } else {
        const input = document.createElement('input');
        input.type = field.type || 'text';
        input.id = `field-${field.key}`;
        input.name = field.key;
        input.value = value;
        if (field.required) input.required = true;
        if (field.step) input.step = field.step;
        if (field.type === 'number') {
          input.addEventListener('input', () => {
            if (input.value && isNaN(Number(input.value))) {
              input.value = value;
            }
          });
        }
        group.appendChild(input);
      }

      this.container.appendChild(group);
    }
  }

  getData() {
    const data = {};
    const fields = this.config.fields || [];

    for (const field of fields) {
      const el = document.getElementById(`field-${field.key}`);
      if (!el) continue;

      if (field.type === 'checkbox') {
        data[field.key] = el.checked;
      } else if (field.type === 'number') {
        data[field.key] = el.value ? Number(el.value) : null;
      } else if (field.type === 'file') {
        const hidden = document.getElementById(`hidden-${field.key}`);
        data[field.key] = hidden ? hidden.value : null;
      } else {
        data[field.key] = el.value || null;
      }
    }

    if (this.config.single) {
      const idEl = this.container.querySelector('input[name="id"]');
      if (idEl && idEl.value) {
        data.id = Number(idEl.value);
      }
    }

    return data;
  }
}
